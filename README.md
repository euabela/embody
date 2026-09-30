# emBODY web

A modern, zero-install rebuild of the **emBODY** bodily-maps tool
([original by Enrico Glerean, Lauri Nummenmaa & Juulia Suvilehto](https://version.aalto.fi/gitlab/eglerean/embody)).
Participants colour the body regions whose activity they feel increasing (left, red) or decreasing (right, blue)
for each stimulus, as in Nummenmaa et al. (2014), *PNAS*.

It is plain HTML + JavaScript: **no PHP, no database, no build step, no dependencies**. It runs in any
modern browser on desktop, tablet or phone (mouse, touch and pen).

| | v1 (PHP) | emBODY web |
|---|---|---|
| Hosting | Apache + PHP, writable `subjects/` folder | Any static host (GitHub Pages, Netlify, a USB stick…) |
| Touch / phones | Partial | Pointer events, responsive layout |
| Data format | `subjects/<id>/{data.txt,presentation.txt,N.csv}` | **Identical** (same 900×600 coordinate space) |
| Analysis | MATLAB | Original MATLAB scripts still work, **plus** an in-browser heatmap viewer |

## Try it locally

```sh
python3 -m http.server 8000     # then open http://localhost:8000
```

Or just double-click `index.html`. Researcher tools live at `admin.html`.

## Set up your experiment

Edit **`config.js`**: title, stimuli (words or images), randomisation, all on-screen texts
(translate them for other languages), background questions on/off, and where data go.
To run several experiments from one site, copy it to e.g. `configs/pilot.js` and share
`index.html?config=configs/pilot.js`. Each config's data are kept separate.

Image stimuli: set `type: "images"`, put the files in `stimuli/`, and list them as
`{ label: "Fear", image: "stimuli/fear.jpg" }`.

Participant IDs are random 8-digit numbers, or come from the link:
`index.html?id=PROLIFIC_PID` (set `completionUrl` to send people back to Prolific/SONA when done).

## Choose how data are collected

1. **No server (default)** — data stay in the participant's browser.
   - *Lab computers:* run participants on your machines, then open `admin.html` and **Download all as ZIP**.
   - *Online:* set `submit.participantDownload: true` so participants download a ZIP at the end and send it to you.
2. **Google Drive, still serverless** — deploy `server/google-apps-script.gs` as a Google Apps Script web app
   (instructions at the top of the file) and put its `/exec` URL in `submit.endpoint`.
3. **Your own server** — `server/server.py` (Python 3, standard library only) serves the site and stores
   submissions as `data/<experiment>/subjects/<id>/…`:
   ```sh
   EMBODY_ADMIN_PASSWORD=change-me python3 server/server.py 8000
   # config.js: submit.endpoint = "api/submit"
   # download everything: http://localhost:8000/api/export
   ```
   Or with Docker (endpoint pre-configured):
   ```sh
   docker build -t embody . && docker run -p 8000:8000 -v "$PWD/data:/data" -e EMBODY_ADMIN_PASSWORD=change-me embody
   ```
   Use HTTPS (e.g. behind Caddy/nginx) for real data collection.

With an endpoint, each finished stimulus is uploaded immediately; data are also kept in the browser, and
participants get a *Try again* button if the upload fails. Each participant folder is locked to the browser
that created it, so one participant can't overwrite another's data.

## Deploy

- **GitHub Pages:** push to `main`, then *Settings → Pages → Source: GitHub Actions*.
  The included workflow (`.github/workflows/pages.yml`) publishes the site.
- **Netlify / Cloudflare Pages / Vercel / any web server:** upload the repository as-is
  (`index.html`, `admin.html`, `config.js`, `css/`, `js/`, `assets/`). No build command.
- **Self-hosted with data collection:** see option 3 above.

## Analysis

`admin.html` loads exported ZIPs or a `subjects/` folder (also folders from the old PHP tool) and draws
per-subject and group-mean maps, reconstructed exactly as `embody_demo.m` does: paint points →
15×15 Gaussian (σ = 5 px) → left body minus right body, masked, hot/cold colour map. Save figures as PNG.

For statistics, the files are drop-in compatible with the original MATLAB code
(`load_subj.m`, `embody_demo.m`, `embody_stats.m` in the upstream repository).

### File format (unchanged from v1)

- `presentation.txt` — stimulus indices in the order shown
- `data.txt` — background answers: `sex,age,weight,height,hand,education,psychologist,psychiatrist,neurologist,`
- `N.csv` — for stimulus *N*: all pointer moves `t,x,y`, then `-1,-1,-1`, paint points `t,x,y`, `-1,-1,-1`,
  press times `t,,`, `-1,-1,-1`, release times `t,,`. Coordinates are in the original 900×600 page
  (left body at x 30–205, right body at x 695–870, top y 10); times are epoch milliseconds.
- `techdata.txt`, `session.json` — browser/screen info and session metadata (new).

## Citation

If you use this tool, please cite:
Nummenmaa L., Glerean E., Hari R., Hietanen J.K. (2014). Bodily maps of emotions.
*PNAS* 111(2), 646–651. doi:10.1073/pnas.1321664111

## License

MIT. The body images and the painting/analysis design come from the original emBODY tool
(© 2015 Glerean, MIT; see `LICENSE.upstream`).
