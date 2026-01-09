export async function inputFromStdin() {
  return JSON.parse(
    await new Promise((resolve) => {
      let data = "";
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("end", () => resolve(data));
    }),
  );
}
