// Memoria de cada personaje (fase B, varios personajes en un proceso): lo que antes eran variables de módulo.
// io.js da a cada bot —y al bot nuevo de cada reconexión— el mismo objeto `bot.yo`; cada módulo guarda en él lo suyo:
// memoria(bot, 'clave', () => valor inicial). Sin clave devuelve todo `bot.yo`.
module.exports = function memoria(bot, clave, crear) {
  const yo = bot.yo || (bot.yo = {})
  if (!clave) return yo
  return yo[clave] || (yo[clave] = crear())
}
