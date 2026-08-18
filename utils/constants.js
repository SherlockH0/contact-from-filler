export const OPENAI = {
  api_key: process.env.OPENAI_API_KEY,
  api_url: process.env.OPENAI_URL,
  model: process.env.OPENAI_MODEL,
};
export const HEADLESS = process.env.HEADLESS !== "false";
export const PROXY = {
  url: process.env.PROXY_URL,
  username: process.env.PROXY_USERNAME,
  password: process.env.PROXY_PASSWORD,
};

export const TWO_CAPTCHA = {
  provider: {
    id: "2captcha",
    token: process.env.TWOCAPTCHA_TOKEN,
  },
  visualFeedback: true,
};

export function getSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}
