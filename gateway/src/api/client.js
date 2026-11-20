// Cliente del servicio de login del portal (auth/), publicado por el gateway como /portal/api. Las cookies de sesion son
// HttpOnly: aqui nunca se tocan, el navegador las manda solo. Si una peticion recibe 401 se intenta UNA renovacion de la
// sesion (compartida entre peticiones simultaneas) y se repite; si tampoco, el error llega a quien llamo.
const API = `${import.meta.env.BASE_URL}portal/api`;

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let renovando = null;
function renovar() {
  if (!renovando) {
    renovando = fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'same-origin' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        renovando = null;
      });
  }
  return renovando;
}

async function pedir(metodo, ruta, cuerpo, puedeRenovar = true) {
  let res;
  try {
    res = await fetch(`${API}${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor');
  }

  // Las rutas /auth/* devuelven su propio 401 (credenciales malas): no se intenta renovar ahi.
  if (res.status === 401 && puedeRenovar && !ruta.startsWith('/auth/') && (await renovar())) {
    return pedir(metodo, ruta, cuerpo, false);
  }

  let json = null;
  try {
    const texto = await res.text();
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null; // p. ej. un 502 del gateway devuelve HTML
  }
  if (!res.ok) throw new ApiError(res.status, json?.error?.message ?? 'No se pudo conectar con el servidor', json?.error?.details);
  return json;
}

export const api = {
  get: async (ruta) => (await pedir('GET', ruta))?.data ?? null,
  post: async (ruta, cuerpo = {}) => (await pedir('POST', ruta, cuerpo))?.data ?? null,
  patch: async (ruta, cuerpo) => (await pedir('PATCH', ruta, cuerpo))?.data ?? null,
  put: async (ruta, cuerpo) => (await pedir('PUT', ruta, cuerpo))?.data ?? null,
  delete: async (ruta) => (await pedir('DELETE', ruta))?.data ?? null,
  // Para listas paginadas: devuelve { data, meta }.
  pagina: async (ruta) => {
    const json = await pedir('GET', ruta);
    return { data: json?.data ?? [], meta: json?.meta ?? {} };
  },
  urlMicrosoft: (destino) => `${API}/auth/azure/login?next=${encodeURIComponent(destino)}`,
};
