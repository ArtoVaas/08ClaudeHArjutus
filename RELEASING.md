# Reliisid ja rollback

## Põhimõtted

- **`main` = toodang.** Railway deploy'b iga `main` haru muudatuse automaatselt.
- **Kõik muudatused tehakse eraldi harus** (`feature/...`, `fix/...`, `docs/...`) ja jõuavad `main`'i ainult GitHubi Pull Requesti kaudu.
- **Iga reliis saab tagi** `vX.Y.Z` (SemVer) ja kirje failis `CHANGELOG.md`. Tag on punkt, kuhu saab alati tagasi minna.
  - `PATCH` (1.0.**1**): veaparandus, uut funktsionaalsust pole
  - `MINOR` (1.**1**.0): uus funktsionaalsus, vana töötab edasi (nt Appeal)
  - `MAJOR` (**2**.0.0): ühildumatu muudatus
- **Andmebaasi migratsioonid on ainult lisavad** (uued tabelid või nullable veerud). Siis saab koodi alati vanemale versioonile tagasi kerida, sest vana kood lihtsalt ei kasuta uusi veerge. Veergude kustutamine või ümbernimetamine tuleb teha eraldi reliisis alles siis, kui ükski kasutusel olev versioon neid enam ei vaja.

## Uue funktsionaalsuse arendamine

```bash
git checkout main
git pull
git checkout -b feature/minu-muudatus
# ... muudatused ...
npm run build          # testid peavad läbima
git add -A
git commit -m "Kirjeldus"
git push -u origin feature/minu-muudatus
```

Seejärel ava GitHubis Pull Request `feature/minu-muudatus` → `main`, aga ära seda veel merge'i.

## Reliisi tegemine

1. Uuenda feature-harus enne merge'i:
   - `package.json` → `"version": "1.1.0"`
   - `CHANGELOG.md` → nimeta `[Unreleased]` ümber `[1.1.0] - AAAA-KK-PP` ja lisa uus tühi `[Unreleased]`
2. Commit + push, seejärel merge'i Pull Request GitHubis. Railway hakkab automaatselt deploy'ma.
3. Kontrolli, et Railway deploy õnnestus ja rakendus töötab (`/api/health` → `"db": true`).
4. Pane reliisile tag:
   ```bash
   git checkout main
   git pull
   git tag -a v1.1.0 -m "v1.1.0 – Appeal feature"
   git push origin v1.1.0
   ```
5. (Valikuline) GitHubis **Releases → Draft a new release**, vali tag `v1.1.0` ja kopeeri tekst CHANGELOGist.

## Rollback

### A. Kiire: Railway (minutitega)
Railway → teenus → **Deployments** → vali viimane töötav deploy → **⋯ → Rollback**.
Kood GitHubis jääb samaks. Järgmine push `main`'i deploy'b uuesti vigase koodi, seega tee kohe ka samm B.

### B. Püsiv: git revert (soovitatav)
Revert tühistab vigase muudatuse uue commitiga. Ajalugu jääb alles ja force-push'i pole vaja.
```bash
git checkout main
git pull
git checkout -b fix/revert-v1.1.0
git revert -m 1 <merge-commiti-hash>   # Pull Requesti merge commit
npm run build
git push -u origin fix/revert-v1.1.0
```
Tee Pull Request → merge → Railway deploy'b → tag `v1.1.1`.

### C. Vaadata või võrrelda vana versiooni
```bash
git checkout v1.0.0           # vaatamiseks (detached HEAD)
git diff v1.0.0 v1.1.0        # mis muutus
git checkout main             # tagasi
```
Ära kasuta `main` harul `git reset --hard` ega `git push --force`. See kustutab ajaloo ka teiste jaoks.

## Hotfix toodangus

```bash
git checkout main && git pull
git checkout -b fix/kirjeldus
# parandus + PATCH versioon package.json ja CHANGELOG.md failis
```
Edasi samamoodi: Pull Request → merge → tag `v1.0.1`.
