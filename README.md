# Daoyi's public GitHub profile

A small, independently usable personal profile at **https://daoyi2026.github.io/**. It keeps the current GitHub profile's white layout, circular avatar, six public pins, contribution calendar, repository list, and starred list. It is a personal page, not a GitHub login page or an official GitHub product.

The interface uses vanilla HTML, CSS, and JavaScript. It has no dependencies, remote fonts, browser API requests, polling, canvas, WebGL, or continuous animation. All external GitHub navigation, Follow, and Star actions open the real GitHub site in a new tab. Local Overview, Repositories, and Stars tabs support keyboard navigation; repository filters include forks by default and search names, descriptions, and topics.

## Public data and provenance

`npm run update` reads public REST endpoints for `daoyi2026`, every page of owned public repositories (including forks), and public starred repositories. Repository privacy/visibility flags and a field allowlist are enforced. Email, tokens, private repositories, authentication forms, and raw upstream HTML are never published.

The current public pinned order, status, and actual achievement badges are parsed from the **anonymous** [GitHub profile](https://github.com/daoyi2026). Contribution dates, levels, per-day counts, and the total come from the **anonymous** [public contribution calendar](https://github.com/users/daoyi2026/contributions). Per-day values must sum to the upstream total and dates must form a continuous year. The calendar is not inferred from commit searches or generated from random values. Avatar and achievement images are downloaded locally from GitHub's public image hosts; GitHub retains rights in its marks and achievement artwork.

`data/profile.json` is the checked-in successful fallback. The generated `data/profile.js` contains the same allowlisted snapshot and is imported by the page module, so the first render is populated before the iframe's load event. No visitor waits for GitHub API availability. The footer shows the snapshot's actual sync time in UTC. Counts are accurate as of that snapshot, rather than live per visitor.

## Refresh and deployment

- `npm run update` refreshes the public snapshot and local images.
- `npm run check` checks the data, browser source constraints, parser fixtures, pagination, filters, and failure behavior.
- `npm run build` produces the allowlisted static artifact in `dist/`.

The Pages workflow runs on pushes, manual dispatch, and every six hours. GitHub can delay scheduled runs. It uses the Actions `GITHUB_TOKEN` only for REST requests made by the build, never for anonymous profile/calendar HTML or images. Local refreshes use anonymous public requests. The token is never serialized into the snapshot or deployed artifact.

Builds recover the latest valid published JSON as an optional fallback, with the checked-in JSON as a local fallback if that request is unavailable. Critical source, privacy, image, or schema failures exit unsuccessfully before replacing data; the workflow does not deploy, so the last successful published site remains. If only the contribution endpoint is missing or its markup changes, its previous valid calendar can be retained with its original timestamp and an explicit freshness note. An incomplete or empty response never replaces a good snapshot.

The workflow generates updated data in the build workspace and uploads an artifact; it never commits generated data back to Git. Only `index.html`, `style.css`, `app.js`, `lib/`, `assets/`, `data/`, and `.nojekyll` enter the artifact. Build tools, fixtures, workflow configuration, and environment variables are excluded.

## Room integration

The profile can be embedded directly at its Pages URL. The room retains its native **1440 × 930** MacBook logical viewport and existing camera, loading, and iframe scheduling behavior. The profile scrolls normally within the device. Its WebGL transition image is a separate, faithful capture of this profile at the same viewport; it is not used for the interactive page.
