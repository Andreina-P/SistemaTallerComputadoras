// Utilidades de texto compartidas por los módulos.

// Escapa \, % y _ para que el texto buscado se tome literalmente en un LIKE.
function escapeLike(text) {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

module.exports = { escapeLike };
