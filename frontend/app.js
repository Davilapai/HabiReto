const logOutput = document.getElementById('logOutput');

function log(msg) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
  logOutput.textContent = `[${timestamp}] ${msg}\n` + logOutput.textContent;
}

document.getElementById('btnCreateAccount').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency: 'COP' })
    });
    const data = await res.json();
    log(`Cuenta creada exitosamente: ID=${data.id} Saldo=${data.balance}`);
  } catch (err) {
    log(`Error al crear cuenta: ${err.message}`);
  }
});

document.getElementById('btnTransfer').addEventListener('click', async () => {
  const source_id = document.getElementById('srcAccount').value;
  const destination_id = document.getElementById('dstAccount').value;
  const amount = parseInt(document.getElementById('transferAmount').value, 10);
  const idempotencyKey = crypto.randomUUID();

  try {
    const res = await fetch('/api/transfers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        source_account_id: source_id,
        destination_account_id: destination_id,
        amount: amount,
        metadata: { motive: "P2P Payment UI" }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Fallo transaccional');
    log(`Transferencia exitosa: Ref=${data.id} Monto=${data.amount} Key=${idempotencyKey}`);
  } catch (err) {
    log(`Error en transferencia: ${err.message}`);
  }
});
