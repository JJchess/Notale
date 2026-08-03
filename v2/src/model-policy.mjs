export const MODEL_POLICY = Object.freeze({
  text: Object.freeze({
    provider: 'siliconflow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKeyEnv: 'SILCONFLOW_API_KEY',
    model: 'deepseek-ai/DeepSeek-V4-Flash',
  }),
  vision: Object.freeze({
    provider: 'siliconflow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKeyEnv: 'SILCONFLOW_API_KEY',
    model: 'Qwen/Qwen3-VL-32B-Instruct',
  }),
  referenceImage: Object.freeze({
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    model: 'openai/gpt-image-2',
  }),
  transparentFallback: Object.freeze({
    provider: 'paratera',
    baseUrl: 'https://llmapi.paratera.com/v1',
    apiKeyEnv: 'API_KEY',
    model: 'Doubao-Seedream-4.0',
  }),
});
