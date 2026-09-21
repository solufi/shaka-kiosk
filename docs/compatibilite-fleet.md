# Compatibilité de cette version

Ce kiosque s’utilise avec l’agent et Fleet de la branche `codex/fleet-reliability-20260921` du dépôt `solufi/shakafleet`.

La validation des codes passe désormais par `http://127.0.0.1:5001/corporate/validate`. Le secret machine reste dans l’agent. Les ventes de frigo utilisent `/fridge/access` puis `/fridge/status` : une seule ouverture par panier et attente de fermeture avant finalisation. Le panier sélectionné détermine le prix ; la vision reste consultative.

Les usages corporatifs et les promotions sont enregistrés avec des identifiants de reprise stables. L’agent les conserve dans son journal SQLite avant transmission à Fleet. Une consommation refusée ne disparaît pas ; elle demande une vérification de maintenance.

Déployer les trois composants ensemble, hors transaction, après sauvegarde. Le guide `docs/fiabilite-et-recette.md` de Shakafleet décrit les secrets, le pilote, la reprise et les limites de ce lot. Les anciennes interfaces d’administration Firebase et les modules AI restent présents ; leur rationalisation et certains avis de dépendances nécessitent une passe distincte.

Validation depuis une copie vierge : `npm ci`, `npm ci --prefix functions`, `npm run build --prefix functions`, `npm run check`, puis `npm run build`. Le sous-projet Firebase possède son propre fichier de dépendances verrouillées ; ses dépendances doivent être installées avant la vérification TypeScript du dépôt. GitHub Actions exécute cette même séquence. Ces contrôles ne remplacent pas les essais du vrai terminal Stripe, du relais, du capteur de porte et des caméras.
