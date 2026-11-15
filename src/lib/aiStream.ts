import { auth } from './firebase';
import type { PlanId } from '../types/database';

export interface StreamAIParams {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  subjectName: string;
  examLevel: string;
  classLevel: string;
  studentName: string;
  onChunk: (partialText: string) => void;
}

export interface StreamAIResult {
  fullText: string;
  usedToday?: number;
  dailyLimit?: number | null;
  plan?: PlanId;
}

export async function streamAITutorResponse(params: StreamAIParams): Promise<StreamAIResult> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in to chat with Exam Master AI.');
  }

  const idToken = await user.getIdToken();
  const res = await fetch('/api/ai/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      message: params.message,
      history: params.history,
      subjectName: params.subjectName,
      examLevel: params.examLevel,
      classLevel: params.classLevel,
      studentName: params.studentName,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const err = new Error(
      typeof errBody?.error === 'string'
        ? errBody.error
        : `Exam Master AI returned an error (${res.status}).`
    ) as Error & { code?: string };
    err.code = errBody?.code;
    throw err;
  }

  if (!res.body) {
    throw new Error('Streaming is not supported in this browser.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let usedToday: number | undefined;
  let dailyLimit: number | null | undefined;
  let plan: PlanId | undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const block of lines) {
      const dataLine = block
        .split('\n')
        .find((l) => l.startsWith('data: '));
      if (!dataLine) continue;

      const jsonStr = dataLine.slice(6).trim();
      if (!jsonStr) continue;

      const evt = JSON.parse(jsonStr) as {
        chunk?: string;
        done?: boolean;
        error?: string;
        usedToday?: number;
        dailyLimit?: number | null;
        plan?: PlanId;
      };

      if (evt.error) {
        throw new Error(evt.error);
      }
      if (evt.chunk) {
        fullText += evt.chunk;
        params.onChunk(fullText);
      }
      if (evt.done) {
        usedToday = evt.usedToday;
        dailyLimit = evt.dailyLimit;
        plan = evt.plan;
      }
    }
  }

  if (!fullText.trim()) {
    throw new Error('No response was generated. Please try again.');
  }

  return { fullText, usedToday, dailyLimit, plan };
}
