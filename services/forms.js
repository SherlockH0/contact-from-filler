export function filterContactLinks(links) {
  const regex = /(contact|get.*touch|reach|support|help)/i;
  const negativeRegex = /blog/i;
  return [
    ...new Set(
      links
        .map((l) => {
          try {
            return new URL(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .filter((u) => {
          if (u.protocol === "mailto:") return false;
          if (negativeRegex.test(u.pathname)) return false;
          return regex.test(u.pathname);
        })
        .map((u) => u.href)
        .sort((a, b) => a.length - b.length),
    ),
  ];
}

export async function submitFormSmart(page, formIndex) {
  return await page.evaluate(async (index) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const form = document.querySelectorAll("form")[index];
    if (!form) return "no-form";

    const click = async (btn, label) => {
      btn.scrollIntoView({ block: "center" });
      await sleep(50);
      btn.click();
      return label;
    };

    for (const btn of form.querySelectorAll(
      'button[type="submit"], input[type="submit"]',
    )) {
      if (!btn.disabled && btn.offsetParent !== null)
        return click(btn, "clicked-submit-button");
    }

    for (const btn of form.querySelectorAll("button, input[type=button]")) {
      if (
        !btn.disabled &&
        btn.offsetParent !== null &&
        /send|submit|continue|next|apply|contact/i.test(
          btn.innerText || btn.value || "",
        )
      ) {
        return click(btn, "clicked-fallback-button");
      }
    }

    if (form.requestSubmit) {
      form.requestSubmit();
      return "requestSubmit";
    }

    const ev = new Event("submit", { bubbles: true, cancelable: true });
    if (form.dispatchEvent(ev)) {
      form.submit();
      return "dispatch-submit";
    }

    form.submit();
    return "forced-submit";
  }, formIndex);
}
