"""Mundo de cuadrícula mínimo para entrenar a Ío a llegar a un árbol y picarlo.

Observación (4 números + memoria de 4, igual que los calcula el bot en Minecraft):
  adelante : distancia al árbol proyectada sobre hacia dónde mira, / tamaño
  lado     : desplazamiento lateral (positivo = a su derecha), / tamaño
  enfrente : 1.0 si el árbol está justo en la casilla de enfrente, si no 0.0
  bloqueado: 1.0 si la casilla de enfrente no se puede pisar (borde u obstáculo)
  previa   : acción anterior en one-hot (4 números; todo ceros al empezar) → memoria corta
Acciones: 0 avanzar · 1 girar izquierda · 2 girar derecha · 3 picar
"""
import numpy as np

DIRS = [(0, -1), (1, 0), (0, 1), (-1, 0)]  # norte, este, sur, oeste
ACCIONES = ["avanzar", "izquierda", "derecha", "picar"]


class MundoArbol:
    def __init__(self, n=8, max_pasos=60, semilla=None, densidad=0.15):
        self.n, self.max_pasos, self.densidad = n, max_pasos, densidad
        self.rng = np.random.default_rng(semilla)

    def _alcanzable(self):
        """¿Puede el agente llegar a una casilla vecina del árbol? (búsqueda en anchura)"""
        n, visto, cola = self.n, {tuple(self.pos)}, [tuple(self.pos)]
        while cola:
            x, y = cola.pop()
            for dx, dy in DIRS:
                v = (x + dx, y + dy)
                if v == tuple(self.arbol):
                    return True
                if 0 <= v[0] < n and 0 <= v[1] < n and not self.obst[v[1], v[0]] and v not in visto:
                    visto.add(v); cola.append(v)
        return False

    def reset(self):
        n = self.n
        while True:
            self.pos = self.rng.integers(0, n, size=2)
            self.arbol = self.rng.integers(0, n, size=2)
            if (self.arbol == self.pos).all():
                continue
            self.obst = self.rng.random((n, n)) < self.densidad
            self.obst[self.pos[1], self.pos[0]] = False
            self.obst[self.arbol[1], self.arbol[0]] = False
            if self._alcanzable():
                break
        self.dir = int(self.rng.integers(0, 4))
        self.pasos = 0
        self.previa = -1
        return self.obs()

    def _libre(self, c):
        return (c >= 0).all() and (c < self.n).all() and not self.obst[c[1], c[0]] and not (c == self.arbol).all()

    def _enfrente(self):
        dx, dy = DIRS[self.dir]
        return self.pos + np.array([dx, dy])

    def obs(self):
        d = self.arbol - self.pos
        fx, fy = DIRS[self.dir]
        rx, ry = -fy, fx  # vector a la derecha
        adelante = d[0] * fx + d[1] * fy
        lado = d[0] * rx + d[1] * ry
        enfrente = float((self._enfrente() == self.arbol).all())
        bloqueado = float(not self._libre(self._enfrente()) and not enfrente)
        previa = np.zeros(4, dtype=np.float32)
        if self.previa >= 0:
            previa[self.previa] = 1.0
        return np.concatenate([[adelante / self.n, lado / self.n, enfrente, bloqueado], previa]).astype(np.float32)

    def step(self, a):
        self.pasos += 1
        self.previa = a
        r, hecho = -0.01, False
        if a == 0:
            nueva = self._enfrente()
            if self._libre(nueva):
                self.pos = nueva
            else:
                r -= 0.02  # chocar con borde o árbol
        elif a == 1:
            self.dir = (self.dir - 1) % 4
        elif a == 2:
            self.dir = (self.dir + 1) % 4
        else:
            if (self._enfrente() == self.arbol).all():
                r, hecho = 1.0, True
            else:
                r -= 0.05  # picar al aire
        if self.pasos >= self.max_pasos:
            hecho = True
        return self.obs(), r, hecho


def politica_voraz(o):
    """Referencia a mano para comprobar que el entorno es resoluble."""
    adelante, lado, enfrente, bloqueado = o[0] * 8, o[1] * 8, o[2], o[3]
    if enfrente:
        return 3
    if bloqueado:
        return 2
    if abs(lado) > 0.5 and adelante <= 0:
        return 2 if lado > 0 else 1
    if adelante > 0.5:
        return 0
    return 2 if lado > 0 else 1


if __name__ == "__main__":
    env, ok, pasos = MundoArbol(semilla=0), 0, []
    for _ in range(500):
        o, hecho, t = env.reset(), False, 0
        while not hecho:
            o, r, hecho = env.step(politica_voraz(o))
            t += 1
        ok += r > 0.5
        pasos.append(t)
    print(f"voraz: {ok}/500 con media {np.mean(pasos):.1f} pasos")
