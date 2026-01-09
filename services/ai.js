import { aiRequest } from "../utils/ai.js";

export async function classifyFormsAI(forms) {
  return await aiRequest(
    `
You analyze website forms.

Your task:
- Select the form that is meant to contact the company.
- Prefer textarea for message
- If no such form is found, return an empty object.

Rules:
- Choose only ONE or ZERO forms
- Prefer textarea for message
- Ignore newsletter, login, demo, search, checkout forms
- Return JSON ONLY

Output format:
{
  "form_index": number,
}`,
    JSON.stringify(forms),
  );
}

export async function mapFormToValues(valid_form, values) {
  // Ask OpenAI which role each field corresponds to
  return await aiRequest(
    `
You are given a list of form fields (id, label, placeholder, name, type, tag) and a list of form values. 
For each field you should return a value to use. For the fields that are not in the list of values, you should generate a realistic value.

Rules:
- For type="email", return a valid email string
- For type="number" or "range", return a number
- For select fields, choose one of the provided options
- For multiple selects, return an array
- Never return null or undefined


Example input:
{
  values: {
    email: "john@gmail.com",
    full_name: "Peter Parker"
  },
  form: [
      {
        id: 'f0',
        tag: 'input',
        type: 'text',
        name: '',
        placeholder: '',
        label: 'Name:',
        multiple: false,
        options: [],
        selectedOptions: []
      },
      {
        id: 'f1',
        tag: 'input',
        type: 'email',
        name: '',
        placeholder: '',
        label: 'Email:',
        multiple: false,
        options: [],
        selectedOptions: []
      },
      {
        id: 'f2',
        tag: 'input',
        type: 'range',
        name: '',
        placeholder: '',
        label: 'Rating (1‑10):',
        multiple: false,
        options: [],
        selectedOptions: []
      }
  ]
}

Your output:
{
  "f0": "Peter Parker",
  "f1": "john@gmail.com",
  "f2": 10
}

Return a JSON object where keys are field ids and values are the final values to fill into the form.
`,
    JSON.stringify({
      values,
      form: valid_form.fields,
    }),
  );
}
