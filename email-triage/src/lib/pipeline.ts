import { supabase } from './supabase';
import {
  fetchInboxEmails,
  archiveMessage,
  ensureLabel,
  addLabel,
  markAsRead,
  createGmailDraft,
} from './gmail';
import { classifyEmail, generateDraftReply } from './claude';
import { sendTriageDigest } from './slack';
import { createPipelineLogger } from './logger';
import { getActiveOverrideRules } from './override-rules';
import type { TeamMember, GmailMessage, ClassifiedEmail, ClassificationResult, PipelineRunResult, TierOverrideRule } from '@/types';

interface PipelineOptions {
  emailCount?: number;
  dryRun?: boolean;
  skipDigest?: boolean;
}

export async function runTriagePipeline(
  teamMemberId: string,
  options: PipelineOptions = {}
): Promise<PipelineRunResult> {
  const { emailCount = 20, dryRun = false, skipDigest = false } = options;

  // ── Setup ──
  const { data: member, error: memberError } = await supabase
    .from('team_members')
    .select('*')
    .eq('id', teamMemberId)
    .single();

  if (memberError || !member) {
    throw new Error(`Team member not found: ${teamMemberId}`);
  }

  const { data: run, error: runError } = await supabase
    .from('triage_runs')
    .insert({ team_member_id: teamMemberId, status: 'running' })
    .select()
    .single();

  if (runError || !run) {
    throw new Error(`Failed to create triage run: ${runError?.message}`);
  }

  const log = createPipelineLogger(run.id);

  // Label cache to avoid repeated API calls
  const labelCache = new Map<string, string>();
  async function cachedEnsureLabel(m: TeamMember, name: string): Promise<string> {
    if (labelCache.has(name)) return labelCache.get(name)!;
    const id = await ensureLabel(m, name);
    labelCache.set(name, id);
    return id;
  }

  // Check override rules against an email
  function checkOverrideRules(
    rules: TierOverrideRule[],
    email: GmailMessage
  ): number | null {
    for (const rule of rules) {
      const value = rule.match_value.toLowerCase();
      switch (rule.match_type) {
        case 'sender':
          if (email.from.toLowerCase().includes(value)) return rule.forced_tier;
          break;
        case 'domain':
          if (
            email.from.toLowerCase().includes(`@${value}`) ||
            email.from.toLowerCase().includes(`.${value}`)
          )
            return rule.forced_tier;
          break;
        case 'subject':
          if (email.subject.toLowerCase().includes(value)) return rule.forced_tier;
          break;
        case 'keyword': {
          const searchText =
            `${email.from} ${email.subject} ${email.snippet}`.toLowerCase();
          if (searchText.includes(value)) return rule.forced_tier;
          break;
        }
      }
    }
    return null;
  }

  try {
    // ═══════════════════════════════════════════
    // PHASE 1: FETCH & DEDUPLICATE
    // ═══════════════════════════════════════════
    await log('info', 'fetch', `Fetching up to ${emailCount} unread emails from Gmail...`);
    const emails = await fetchInboxEmails(member as TeamMember, emailCount);
    await log('success', 'fetch', `Fetched ${emails.length} emails`);

    const gmailIds = emails.map((e) => e.id);
    const { data: existing } = await supabase
      .from('classified_emails')
      .select('gmail_message_id')
      .eq('team_member_id', teamMemberId)
      .in('gmail_message_id', gmailIds);

    const existingIds = new Set((existing ?? []).map((e) => e.gmail_message_id));
    const newEmails = emails.filter((e) => !existingIds.has(e.id));
    await log('info', 'fetch', `${newEmails.length} new emails to process (${existingIds.size} already classified)`);

    // ═══════════════════════════════════════════
    // PHASE 2: CLASSIFY
    // ═══════════════════════════════════════════
    let tier1Count = 0;
    let tier2Count = 0;
    let tier3Count = 0;
    let tier4Count = 0;

    // Keep original email data in memory for draft generation
    const emailMap = new Map<string, GmailMessage>();
    const classificationMap = new Map<string, ClassificationResult>();

    // Load user override rules once
    const overrideRules = await getActiveOverrideRules(teamMemberId);
    if (overrideRules.length > 0) {
      await log('info', 'classify', `Loaded ${overrideRules.length} user override rule(s)`);
    }

    for (const email of newEmails) {
      emailMap.set(email.id, email);

      try {
        // Check user overrides FIRST
        const overrideTier = checkOverrideRules(overrideRules, email);
        let classification: ClassificationResult;

        if (overrideTier !== null) {
          classification = {
            tier: overrideTier as 1 | 2 | 3 | 4,
            label: 'user-rule',
            summary: email.snippet?.slice(0, 100) ?? '',
            summary_oneline: email.snippet?.slice(0, 80) ?? '',
            priority_reason: 'User override rule',
            needs_reply: false,
            suggested_action: null,
            suggested_assignee: null,
            draft_reply: null,
          };
          await log('info', 'classify', `Override → Tier ${overrideTier}: ${email.subject?.slice(0, 60)}`);
        } else {
          await log('info', 'classify', `Classifying: ${email.subject?.slice(0, 60)}`);
          classification = await classifyEmail(email);
        }

        classificationMap.set(email.id, classification);

        await supabase.from('classified_emails').insert({
          triage_run_id: run.id,
          team_member_id: teamMemberId,
          gmail_message_id: email.id,
          gmail_thread_id: email.threadId,
          from_address: email.from,
          to_addresses: email.to ?? null,
          cc_addresses: email.cc ?? null,
          subject: email.subject,
          snippet: email.snippet,
          received_at: email.receivedAt,
          tier: classification.tier,
          label: classification.label,
          summary: classification.summary,
          summary_oneline: classification.summary_oneline,
          priority_reason: classification.priority_reason,
          suggested_action: classification.suggested_action,
          suggested_assignee: classification.suggested_assignee,
          needs_reply: classification.needs_reply,
          draft_reply_text: classification.draft_reply,
        });

        if (classification.tier === 1) tier1Count++;
        else if (classification.tier === 2) tier2Count++;
        else if (classification.tier === 3) tier3Count++;
        else tier4Count++;

        await log('success', 'classify', `Tier ${classification.tier}: ${classification.label}`);
      } catch (classifyError) {
        const msg = classifyError instanceof Error ? classifyError.message : String(classifyError);
        await log('error', 'classify', `Failed to classify "${email.subject?.slice(0, 40)}": ${msg}`);
      }
    }

    // Update run counts
    await supabase
      .from('triage_runs')
      .update({
        emails_fetched: emails.length,
        emails_classified: newEmails.length,
        tier1_count: tier1Count,
        tier2_count: tier2Count,
        tier3_count: tier3Count,
        tier4_count: tier4Count,
      })
      .eq('id', run.id);

    let archivedCount = 0;
    let draftsCreated = 0;

    if (!dryRun) {
      // ═══════════════════════════════════════════
      // PHASE 3: PER-TIER GMAIL ACTIONS
      // ═══════════════════════════════════════════

      // Helper to create a draft for an email
      async function createDraftForEmail(email: ClassifiedEmail): Promise<boolean> {
        const originalEmail = emailMap.get(email.gmail_message_id);
        const classification = classificationMap.get(email.gmail_message_id);
        if (!originalEmail || !classification) return false;

        try {
          await log('info', 'draft', `Generating draft reply for: ${email.subject?.slice(0, 60)}`);

          const draftText = await generateDraftReply(
            originalEmail,
            classification,
            member.email_style
          );

          const senderEmail = email.from_address?.match(/<([^>]+)>/)?.[1] ?? email.from_address ?? '';
          const replySubject = email.subject?.startsWith('Re:')
            ? email.subject
            : `Re: ${email.subject ?? ''}`;

          // Build Reply All recipients: Cc = original To + Cc, minus our own email
          const myEmail = member.email.toLowerCase();
          const parseAddresses = (raw?: string | null) =>
            (raw ?? '').split(',').map(a => a.trim()).filter(Boolean);
          const ccList = [
            ...parseAddresses(originalEmail.to),
            ...parseAddresses(originalEmail.cc),
          ].filter(addr => {
            const email = addr.match(/<([^>]+)>/)?.[1] ?? addr;
            return email.toLowerCase() !== myEmail;
          });

          const gmailDraftId = await createGmailDraft(member as TeamMember, {
            to: senderEmail,
            cc: ccList.length > 0 ? ccList.join(', ') : undefined,
            subject: replySubject,
            body: draftText,
            inReplyTo: originalEmail.messageIdHeader,
            threadId: email.gmail_thread_id ?? undefined,
          });

          await supabase
            .from('classified_emails')
            .update({
              draft_reply_text: draftText,
              gmail_draft_id: gmailDraftId,
              draft_created: true,
            })
            .eq('id', email.id);

          draftsCreated++;
          await log('success', 'draft', `Draft created for: ${email.subject?.slice(0, 60)}`);
          return true;
        } catch (draftError) {
          const msg = draftError instanceof Error ? draftError.message : String(draftError);
          await log('error', 'draft', `Failed to create draft for "${email.subject?.slice(0, 40)}": ${msg}`);
          return false;
        }
      }

      // ── Tier 1: Label + Archive + Mark Read ──
      const { data: t1Emails } = await supabase
        .from('classified_emails')
        .select('*')
        .eq('triage_run_id', run.id)
        .eq('tier', 1);

      for (const email of t1Emails ?? []) {
        try {
          const labelId = await cachedEnsureLabel(member as TeamMember, 'Tier 1');
          await addLabel(member as TeamMember, email.gmail_message_id, labelId);
          await archiveMessage(member as TeamMember, email.gmail_message_id);
          await markAsRead(member as TeamMember, email.gmail_message_id);
          await supabase
            .from('classified_emails')
            .update({ archived: true })
            .eq('id', email.id);
          archivedCount++;
          await log('success', 'archive', `T1 archived: ${email.subject?.slice(0, 60)}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await log('error', 'archive', `T1 failed "${email.subject?.slice(0, 40)}": ${msg}`);
        }
      }

      // ── Tier 2: Label + Archive + Mark Read + Draft if needs_reply ──
      const { data: t2Emails } = await supabase
        .from('classified_emails')
        .select('*')
        .eq('triage_run_id', run.id)
        .eq('tier', 2);

      for (const email of t2Emails ?? []) {
        try {
          const labelId = await cachedEnsureLabel(member as TeamMember, 'Tier 2');
          await addLabel(member as TeamMember, email.gmail_message_id, labelId);
          await archiveMessage(member as TeamMember, email.gmail_message_id);
          await markAsRead(member as TeamMember, email.gmail_message_id);
          await supabase
            .from('classified_emails')
            .update({ archived: true })
            .eq('id', email.id);
          archivedCount++;
          await log('success', 'archive', `T2 archived: ${email.subject?.slice(0, 60)}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await log('error', 'archive', `T2 failed "${email.subject?.slice(0, 40)}": ${msg}`);
        }

        if (email.needs_reply && member.feature_inbox_drafting) {
          await createDraftForEmail(email as ClassifiedEmail);
        }
      }

      // ── Tier 3: Label only (keep in inbox, keep unread) + Draft if needs_reply ──
      const { data: t3Emails } = await supabase
        .from('classified_emails')
        .select('*')
        .eq('triage_run_id', run.id)
        .eq('tier', 3);

      for (const email of t3Emails ?? []) {
        try {
          const labelId = await cachedEnsureLabel(member as TeamMember, 'Tier 3');
          await addLabel(member as TeamMember, email.gmail_message_id, labelId);
          await log('success', 'archive', `T3 labeled: ${email.subject?.slice(0, 60)}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await log('error', 'archive', `T3 failed "${email.subject?.slice(0, 40)}": ${msg}`);
        }

        if (email.needs_reply && member.feature_inbox_drafting) {
          await createDraftForEmail(email as ClassifiedEmail);
        }
      }

      // ── Tier 4: Label (keep in inbox, keep unread) + Draft if needs_reply ──
      const { data: t4Emails } = await supabase
        .from('classified_emails')
        .select('*')
        .eq('triage_run_id', run.id)
        .eq('tier', 4);

      for (const email of t4Emails ?? []) {
        try {
          const labelId = await cachedEnsureLabel(member as TeamMember, 'Tier 4');
          await addLabel(member as TeamMember, email.gmail_message_id, labelId);
          await log('success', 'archive', `T4 labeled: ${email.subject?.slice(0, 60)}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await log('error', 'archive', `T4 failed "${email.subject?.slice(0, 40)}": ${msg}`);
        }

        if (email.needs_reply && member.feature_inbox_drafting) {
          await createDraftForEmail(email as ClassifiedEmail);
        }
      }

      // ═══════════════════════════════════════════
      // PHASE 4: CONSOLIDATED SLACK DIGEST
      // ═══════════════════════════════════════════
      if (skipDigest) {
        await log('info', 'digest', 'Skipping Slack digest (instant processing mode)');
      } else if (member.slack_user_id) {
        const { data: allRunEmails } = await supabase
          .from('classified_emails')
          .select('*')
          .eq('triage_run_id', run.id)
          .order('tier', { ascending: false });

        const digestEmails = (allRunEmails ?? []) as ClassifiedEmail[];
        const hasContent = digestEmails.some((e) => e.tier >= 2);

        if (hasContent) {
          try {
            await log('info', 'digest', 'Building consolidated Slack digest...');
            await sendTriageDigest(member.slack_user_id, digestEmails, {
              totalClassified: newEmails.length,
              tier1Count,
              tier2Count,
              tier3Count,
              tier4Count,
              archivedCount,
              draftsCreated,
            });

            await supabase
              .from('classified_emails')
              .update({ slack_dm_sent: true })
              .eq('triage_run_id', run.id)
              .gte('tier', 2);

            await supabase
              .from('triage_runs')
              .update({ slack_digest_sent: true })
              .eq('id', run.id);

            await log('success', 'digest', 'Slack digest sent');
          } catch (slackError) {
            const msg = slackError instanceof Error ? slackError.message : String(slackError);
            await log('error', 'digest', `Failed to send Slack digest: ${msg}`);
          }
        } else {
          await log('info', 'digest', 'No T2+ emails — skipping Slack digest');
        }
      } else {
        await log('warn', 'digest', 'No Slack user ID configured — skipping digest');
      }
    } else {
      await log('info', 'pipeline', 'Dry run mode — skipping Gmail actions and Slack digest');
    }

    // ═══════════════════════════════════════════
    // PHASE 5: COMPLETE
    // ═══════════════════════════════════════════
    await supabase
      .from('triage_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        archived_count: archivedCount,
        drafts_created: draftsCreated,
        slack_dms_sent: dryRun ? 0 : (tier2Count + tier3Count + tier4Count > 0 ? 1 : 0),
      })
      .eq('id', run.id);

    await log('success', 'complete', 'Pipeline complete');

    return {
      runId: run.id,
      status: 'completed',
      emailsFetched: emails.length,
      emailsClassified: newEmails.length,
      tier1Count,
      tier2Count,
      tier3Count,
      tier4Count,
      archivedCount,
      slackDmsSent: dryRun ? 0 : 1,
      draftsCreated,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await supabase
      .from('triage_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: msg,
      })
      .eq('id', run.id);

    await log('error', 'pipeline', `Pipeline failed: ${msg}`);

    return {
      runId: run.id,
      status: 'failed',
      emailsFetched: 0,
      emailsClassified: 0,
      tier1Count: 0,
      tier2Count: 0,
      tier3Count: 0,
      tier4Count: 0,
      archivedCount: 0,
      slackDmsSent: 0,
      draftsCreated: 0,
    };
  }
}
