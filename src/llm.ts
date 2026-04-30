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
  console.debug('[generateWithAnthropic] response JSON:', json);

  const extracted = json.content?.map((part: { type: string; text?: string }) => part.type === 'text' ? part.text : '').join('\n').trim() ?? '';
  if (!extracted) {
    throw new Error(`Anthropic returned no extractable text. Response: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return extracted;
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
      max_output_tokens: 8000,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `OpenAI API request failed with ${response.status}`);
  }

  const json = await response.json();
  console.debug('[generateWithOpenAI] response JSON:', json);

  if (json.status === 'incomplete') {
    const reason = json.incomplete_details?.reason ?? 'unknown';
    throw new Error(`OpenAI returned incomplete response (reason: ${reason}). Try a smaller model, simpler prompt, or split the request.`);
  }

  const direct = typeof json.output_text === 'string' ? json.output_text.trim() : '';
  const fromArray = (json.output ?? [])
    .flatMap((item: { content?: Array<{ type: string; text?: string }> }) => item.content ?? [])
    .map((part: { type: string; text?: string }) => part.type === 'output_text' || part.type === 'text' ? part.text ?? '' : '')
    .join('\n')
    .trim();

  const extracted = direct || fromArray;
  if (!extracted) {
    throw new Error(`OpenAI returned no extractable text. Response: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return extracted;
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
  console.debug('[generateWithDeepSeek] response JSON:', json);

  const extracted = json.choices?.map((choice: { message?: { content?: string } }) => choice.message?.content ?? '').join('\n').trim() ?? '';
  if (!extracted) {
    throw new Error(`DeepSeek returned no extractable text. Response: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return extracted;
}
