/* Catálogo de idiomas: lo usan la portada (index.html) y la app (app.html).
 * Para añadir un idioma: crea lang_<código>.js con el mismo formato y agrégalo aquí. */
window.LANGS = [
  {code:'en', n:'Inglés',    nat:'English',   f:'🇬🇧', key:'english-plan',    c:'#2563eb', d:'Pronunciación guiada y conversación real.'},
  {code:'pt', n:'Portugués', nat:'Português', f:'🇧🇷', key:'portuguese-plan', c:'#15803d', d:'Portugués de Brasil, claro y práctico.'},
  {code:'fr', n:'Francés',   nat:'Français',  f:'🇫🇷', key:'french-plan',     c:'#1d4ed8', d:'Vocales nasales, enlaces y frases cotidianas.'},
  {code:'it', n:'Italiano',  nat:'Italiano',  f:'🇮🇹', key:'italian-plan',    c:'#b45309', d:'Pronunciación, vocabulario y frases cotidianas.'},
  {code:'de', n:'Alemán',    nat:'Deutsch',   f:'🇩🇪', key:'german-plan',     c:'#7c3aed', d:'Géneros, sonidos clave y frases del día a día.', isNew:1},
  {code:'zh', n:'Chino',     nat:'中文',       f:'🇨🇳', key:'chinese-plan',    c:'#e11d3e', cjk:1, d:'Tonos, caracteres y frases del día a día.'},
  {code:'ja', n:'Japonés',   nat:'日本語',     f:'🇯🇵', key:'japanese-plan',   c:'#be185d', cjk:1, d:'Kana, kanji y frases con romaji.'},
  {code:'ko', n:'Coreano',   nat:'한국어',     f:'🇰🇷', key:'korean-plan',     c:'#4f46e5', cjk:1, d:'Hangul, romanización y frases útiles.'},
  {code:'ru', n:'Ruso',      nat:'Русский',   f:'🇷🇺', key:'russian-plan',    c:'#0e7490', d:'Cirílico con transliteración y audio.'}
];
window.LANG_TOTAL = 793;   // palabras y frases por idioma
