# Generador de la copia Word de la entrega SEPSA

Lee los Markdown de `docs/entrega-sepsa/` (índice `README.md` y documentos `01` a `14`) y escribe `docs/entrega-sepsa/entrega-sepsa-SEPSA.docx`. El `.docx` no se commitea (D030); esta carpeta sí (D032).

## Generar la copia Word

```sh
cd docs/entrega-sepsa/generador
npm ci
npm run build
```

Si el `.docx` está abierto en Word, Windows no deja sobrescribirlo. Cierra Word o usa otra ruta:

```sh
SALIDA=/ruta/alternativa.docx npm run build
```

## Regenerar el diagrama entidad-relación

El diagrama de `04` es `img/modelo-er.mmd` (Mermaid) y su imagen es `img/modelo-er.png`. Para regenerar la imagen hace falta Chrome instalado. Crea un `puppeteer.json` fuera del repo con la ruta de tu Chrome:

```json
{ "executablePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "args": ["--no-sandbox"] }
```

Y después, con `@mermaid-js/mermaid-cli` instalado fuera del repo:

```sh
mmdc -p puppeteer.json -i img/modelo-er.mmd -o img/modelo-er.png -b white -s 2
```

## Qué hace el generador

- Portada, contenido (campo TOC de Word, nivel 1), y los 14 documentos uno tras otro.
- No muestra las líneas `Fuente:`, `Fecha:` ni `Estado:` de cada documento, ni fechas de la copia (D032).
- Muestra el marcador de pendiente como «Pendiente de SEPSA».
- Sustituye los nombres de archivo `.md` del índice por «sección NN».
- Imágenes: las de escritorio a 12 cm; las de móvil, de tres en fila con pie; el diagrama en una hoja apaisada.
- Pie «Página X de Y»; la portada no lleva cabecera ni pie.

Estas transformaciones son solo de presentación: las fuentes no cambian.

## Límites

- Word pide actualizar campos al abrir el archivo (el índice): aceptar.
- La maquetación se comprobó con LibreOffice, no con Word. El número de páginas puede variar un poco.
