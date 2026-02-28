import { supabase } from './supabase';
import type { LogLevel, PipelineStep } from '@/types';

export function createPipelineLogger(triageRunId: string) {
  return async function log(
    level: LogLevel,
    step: PipelineStep,
    message: string,
    metadata?: Record<string, unknown>
  ) {
    await supabase.from('pipeline_logs').insert({
      triage_run_id: triageRunId,
      level,
      step,
      message,
      metadata: metadata ?? null,
    });
  };
}
