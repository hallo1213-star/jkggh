const form = document.getElementById('login-form');
const errorBox = document.getElementById('login-error');
const submit = document.getElementById('login-submit');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.textContent = '';
  submit.disabled = true;
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: form.password.value })
    });
    if (response.ok) {
      location.replace('/');
      return;
    }
    const body = await response.json().catch(() => ({}));
    errorBox.textContent = body.error || 'Anmeldung fehlgeschlagen.';
    form.password.select();
  } catch {
    errorBox.textContent = 'Jarvis ist nicht erreichbar. Wacht der Server gerade auf? Bitte in einer Minute erneut versuchen.';
  } finally {
    submit.disabled = false;
  }
});
