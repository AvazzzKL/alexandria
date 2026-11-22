# Alexandria

App personal de microaprendizaje, inspirada en la Biblioteca de Alejandría.
Es una **PWA**: una página web que se instala como app en Android, iPhone o computadora.

## Cómo está hecha

Sin frameworks ni compilación: HTML, CSS y JavaScript puro, para que sea fácil de leer.

| Archivo | Qué hace |
|---|---|
| `index.html` | La página base |
| `css/styles.css` | Todo el diseño (colores en `:root`, modo oscuro incluido) |
| `js/app.js` | Las pantallas: Inicio, Ágora, Biblioteca, Lección, Perfil |
| `js/cards.js` | Los 6 tipos de tarjeta interactiva |
| `js/fsrs.js` | Repetición espaciada (decide cuándo vuelve cada tarjeta) |
| `js/store.js` | Guarda tu progreso en el dispositivo |
| `js/gemini.js` | Pide lecciones nuevas a Gemini |
| `js/content/topics.js` | Temas y temarios |
| `js/content/lessons.js` | Lecciones escritas a mano |
| `sw.js` | Permite usarla sin internet |

## Probarla en la computadora

```bash
python3 -m http.server 5173
```

Luego abre http://localhost:5173

## Usarla en el teléfono

Para instalarla hay que publicarla en una dirección con HTTPS (GitHub Pages, Netlify o Cloudflare Pages; todas gratis).
Después, en Chrome para Android: menú ⋮ → «Instalar app». En iPhone (Safari): Compartir → «Agregar a inicio».
