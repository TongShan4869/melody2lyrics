export async function generateWithAnthropic(prompt: string, apiKey: string, model: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Claude API request failed with ${response.status}`);
  }

  const json = await response.json();
  return json.content?.map((part: { type: string; text?: string }) => part.type === 'text' ? part.text : '').join('\n').trim() ?? '';
}

export async function generateWithOpenAI(prompt: string, apiKey: string, model: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-5.5',
      input: prompt,
      max_output_tokens: 1400,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `OpenAI API request failed with ${response.status}`);
  }

  const json = await response.json();
  if (typeof json.output_text === 'string') return json.output_text.trim();

  return (json.output ?? [])
    .flatMap((item: { content?: Array<{ type: string; text?: string }> }) => item.content ?? [])
    .map((part: { type: string; text?: string }) => part.type === 'output_text' || part.type === 'text' ? part.text ?? '' : '')
    .join('\n')
    .trim();
}

export async function generateWithDeepSeek(prompt: string, apiKey: string, model: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'deepseek-v4-flash',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1400,
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `DeepSeek API request failed with ${response.status}`);
  }

  const json = await response.json();
  return json.choices?.map((choice: { message?: { content?: string } }) => choice.message?.content ?? '').join('\n').trim() ?? '';
}
