document.getElementById('allow').addEventListener('click', async () => {
  const out = document.getElementById('result');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    out.textContent = 'Done. You can close this tab and go back to AccessAI.';
  } catch {
    out.textContent = 'The microphone was not allowed. You can change this in your browser settings.';
  }
});
