import { supabase } from './supabase';
import type { TierOverrideRule, ParsedOverrideRule } from '@/types';

export async function getActiveOverrideRules(
  teamMemberId: string
): Promise<TierOverrideRule[]> {
  const { data, error } = await supabase
    .from('tier_override_rules')
    .select('*')
    .eq('team_member_id', teamMemberId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch override rules: ${error.message}`);
  return (data ?? []) as TierOverrideRule[];
}

export async function upsertOverrideRule(
  teamMemberId: string,
  rule: ParsedOverrideRule,
  reason?: string
): Promise<TierOverrideRule> {
  const { data, error } = await supabase
    .from('tier_override_rules')
    .upsert(
      {
        team_member_id: teamMemberId,
        match_type: rule.match_type,
        match_value: rule.match_value.toLowerCase(),
        forced_tier: rule.forced_tier,
        reason: reason ?? rule.description,
        is_active: true,
      },
      { onConflict: 'team_member_id,match_type,match_value' }
    )
    .select()
    .single();

  if (error) throw new Error(`Failed to upsert override rule: ${error.message}`);
  return data as TierOverrideRule;
}

export async function deactivateOverrideRule(ruleId: string): Promise<void> {
  const { error } = await supabase
    .from('tier_override_rules')
    .update({ is_active: false })
    .eq('id', ruleId);

  if (error) throw new Error(`Failed to deactivate rule: ${error.message}`);
}

export async function getTeamMemberBySlackId(
  slackUserId: string
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from('team_members')
    .select('id, name')
    .eq('slack_user_id', slackUserId)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;
  return data as { id: string; name: string };
}
