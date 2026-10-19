"""Red 25→64→64→6 de entrenar_habilidades.py en numpy, con su paso de aprendizaje (DQN doble + imitación con margen, DQfD),
recorte de gradiente y Adam escritos a mano. Hace las mismas cuentas que la versión de torch (probar_rapido.py lo comprueba);
con lotes de 256 y una red tan pequeña, torch gasta casi todo el tiempo en su propia maquinaria y esto va varias veces más rápido.
Los parámetros van en un solo vector float32 (theta): pesos y sesgos de cada capa en el orden de nn.Sequential."""
import numpy as np

from entorno_habilidades import HABILIDADES, OBS

NO, NA, OCULTA = len(OBS), len(HABILIDADES), 64
FORMAS = [(OCULTA, NO), (OCULTA,), (OCULTA, OCULTA), (OCULTA,), (NA, OCULTA), (NA,)]
TAMANOS = [int(np.prod(f)) for f in FORMAS]
N_PARAMETROS = sum(TAMANOS)
MARGEN = (0.2 * (1 - np.eye(NA))).astype(np.float32)  # MARGEN[g][j] = 0,2 si j ≠ g


def red_nueva(rng):
    """Como nn.Linear de torch: pesos y sesgos uniformes en ±1/√entradas."""
    partes = []
    for salida, entrada in ((OCULTA, NO), (OCULTA, OCULTA), (NA, OCULTA)):
        k = 1 / np.sqrt(entrada)
        partes += [rng.uniform(-k, k, (salida, entrada)).ravel(), rng.uniform(-k, k, salida)]
    return np.concatenate(partes).astype(np.float32)


def capas(theta):
    """Vistas (sin copiar) de W1, b1, W2, b2, W3, b3 dentro de theta."""
    out, i = [], 0
    for f, n in zip(FORMAS, TAMANOS):
        out.append(theta[i:i + n].reshape(f))
        i += n
    return out


def adelante(theta, x):
    W1, b1, W2, b2, W3, b3 = capas(theta)
    h = np.maximum(x @ W1.T + b1, 0)
    h = np.maximum(h @ W2.T + b2, 0)
    return h @ W3.T + b3


def a_json(theta):
    """Las capas en el formato de politica_habilidades*.json ({"w", "b"} por capa lineal)."""
    W1, b1, W2, b2, W3, b3 = capas(theta)
    return [{"w": w.tolist(), "b": b.tolist()} for w, b in ((W1, b1), (W2, b2), (W3, b3))]


def de_json(capas_json, dtype=np.float32):
    return np.concatenate([np.asarray(x, dtype=dtype).ravel() for c in capas_json for x in (c["w"], c["b"])])


class Adam:
    """torch.optim.Adam (sin weight_decay ni amsgrad) sobre el vector theta."""

    def __init__(self, n, lr=5e-4, betas=(0.9, 0.999), eps=1e-8):
        self.lr, (self.b1, self.b2), self.eps, self.t = lr, betas, eps, 0
        self.m, self.v = np.zeros(n, np.float32), np.zeros(n, np.float32)

    def paso(self, theta, g):
        self.t += 1
        self.m += (1 - self.b1) * (g - self.m)  # torch: exp_avg.lerp_(grad, 1 - beta1)
        self.v *= self.b2
        self.v += (1 - self.b2) * g * g
        bc1, bc2 = 1 - self.b1 ** self.t, 1 - self.b2 ** self.t
        theta -= (self.lr / bc1) * self.m / (np.sqrt(self.v) / np.sqrt(bc2) + self.eps)


def gradiente(theta, objetivo, s, a, r, s2, d, dt, g, peso_imitacion, gamma=0.97, recorte=10.0):
    """Gradiente (ya recortado a norma `recorte`) de la pérdida de entrenar_habilidades.py en un lote:
    smooth_l1(Q(s,a), r + γ^(dt/10)·Q_obj(s2, argmax Q(s2))·(1-d)) + peso·media(max_j(Q(s,j) + 0,2·[j≠g]) − Q(s,g))."""
    W1, b1, W2, b2, W3, b3 = capas(theta)
    B, filas = len(s), np.arange(len(s))
    z1 = s @ W1.T + b1
    h1 = np.maximum(z1, 0)
    z2 = h1 @ W2.T + b2
    h2 = np.maximum(z2, 0)
    qs = h2 @ W3.T + b3
    q2 = adelante(objetivo, s2)[filas, adelante(theta, s2).argmax(1)]  # DQN doble: la red elige, la objetivo valora
    y = r + gamma ** (dt / 10) * q2 * (1 - d)
    dq = np.zeros_like(qs)
    dq[filas, a] = np.clip(qs[filas, a] - y, -1, 1) / B  # derivada de smooth_l1 (beta 1) con media
    if peso_imitacion > 0:
        margen = qs + MARGEN[g]
        dq[filas, margen.argmax(1)] += peso_imitacion / B
        dq[filas, g] -= peso_imitacion / B
    dz2 = (dq @ W3) * (z2 > 0)
    dz1 = (dz2 @ W2) * (z1 > 0)
    grad = np.concatenate([(dz1.T @ s).ravel(), dz1.sum(0), (dz2.T @ h1).ravel(), dz2.sum(0), (dq.T @ h2).ravel(), dq.sum(0)])
    norma = float(np.sqrt(np.dot(grad, grad)))
    coef = recorte / (norma + 1e-6)  # nn.utils.clip_grad_norm_
    if coef < 1:
        grad *= np.float32(coef)
    return grad.astype(np.float32, copy=False)
