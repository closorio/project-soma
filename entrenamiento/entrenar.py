"""Entrenamiento local de Ío (mismo código que el cuaderno de Colab)."""
import json, random, numpy as np, torch, torch.nn as nn
from collections import deque
from entorno import MundoArbol, politica_voraz

random.seed(0); np.random.seed(0); torch.manual_seed(0)
dispositivo = 'cuda' if torch.cuda.is_available() else 'cpu'
red = nn.Sequential(nn.Linear(10, 64), nn.ReLU(), nn.Linear(64, 64), nn.ReLU(), nn.Linear(64, 4)).to(dispositivo)
objetivo = nn.Sequential(nn.Linear(10, 64), nn.ReLU(), nn.Linear(64, 64), nn.ReLU(), nn.Linear(64, 4)).to(dispositivo)
objetivo.load_state_dict(red.state_dict())
opt = torch.optim.Adam(red.parameters(), lr=1e-3)
memoria = deque(maxlen=50_000)
env = MundoArbol(semilla=1)
GAMMA, LOTE = 0.97, 128

def evaluar(n=300):
    e, ok = MundoArbol(semilla=999), 0
    for _ in range(n):
        o, hecho = e.reset(), False
        while not hecho:
            with torch.no_grad():
                a = int(red(torch.tensor(o, device=dispositivo)).argmax())
            o, r, hecho = e.step(a)
        ok += r > 0.5
    return ok / n

paso = 0
for ep in range(10000):
    eps = max(0.05, 1.0 - ep / 5000)
    o, hecho = env.reset(), False
    while not hecho:
        if random.random() < eps:
            a = random.randrange(4)
        else:
            with torch.no_grad():
                a = int(red(torch.tensor(o, device=dispositivo)).argmax())
        o2, r, hecho = env.step(a)
        memoria.append((o, a, r, o2, float(hecho)))
        o = o2; paso += 1
        if len(memoria) >= 1000:
            lote = random.sample(memoria, LOTE)
            s, a_, r_, s2, d = (torch.tensor(np.array(x), dtype=torch.float32, device=dispositivo) for x in zip(*lote))
            q = red(s).gather(1, a_.long().unsqueeze(1)).squeeze(1)
            with torch.no_grad():
                y = r_ + GAMMA * objetivo(s2).max(1).values * (1 - d)
            perdida = nn.functional.smooth_l1_loss(q, y)
            opt.zero_grad(); perdida.backward(); opt.step()
        if paso % 500 == 0:
            objetivo.load_state_dict(red.state_dict())
    if ep % 1000 == 0:
        print(f'episodio {ep}  eps {eps:.2f}  aciertos {evaluar():.0%}')
print('final:', f'{evaluar():.0%} de aciertos (referencia a mano: 100%)')

# Exportar los pesos para usarlos desde JavaScript (sin torch)
capas = [m for m in red if isinstance(m, nn.Linear)]
politica = {'capas': [{'w': c.weight.detach().cpu().numpy().tolist(), 'b': c.bias.detach().cpu().numpy().tolist()} for c in capas],
            'acciones': ['avanzar', 'izquierda', 'derecha', 'picar']}
json.dump(politica, open('politica.json', 'w'))

# Comprobación: la inferencia con numpy debe dar las mismas acciones que torch
def con_numpy(o):
    x = np.array(o)
    for i, c in enumerate(politica['capas']):
        x = np.array(c['w']) @ x + np.array(c['b'])
        if i < len(politica['capas']) - 1: x = np.maximum(x, 0)
    return int(x.argmax())
e, coinciden = MundoArbol(semilla=5), 0
for _ in range(200):
    o = e.reset()
    coinciden += con_numpy(o) == int(red(torch.tensor(o, device=dispositivo)).argmax())
print('coincidencia numpy/torch:', coinciden, '/ 200')
