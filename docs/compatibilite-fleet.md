# Compatibilité de cette version

Ce kiosque s’utilise avec l’agent et Fleet de la branche `codex/fleet-reliability-20260921` du dépôt `solufi/shakafleet`.

La validation des codes passe désormais par `http://127.0.0.1:5001/corporate/validate`. Le secret machine reste dans l’agent. Les ventes de frigo utilisent `/fridge/access` puis `/fridge/status` : une seule ouverture par panier et attente de fermeture avant finalisation. Le panier sélectionné détermine le prix ; la vision reste consultative.

Les usages corporatifs et les promotions sont enregistrés avec des identifiants de reprise stables. L’agent les conserve dans son journal SQLite avant transmission à Fleet. Une consommation refusée ne disparaît pas ; elle demande une vérification de maintenance.

Déployer les trois composants ensemble, hors transaction, après sauvegarde. Le guide `docs/fiabilite-et-recette.md` de Shakafleet décrit les secrets, le pilote, la reprise et les limites de ce lot. Les anciennes fonctions cloud Firebase sont conservées uniquement comme historique ; le kiosk ne les appelle pas.

Validation depuis une copie vierge : `npm ci`, `npm ci --prefix functions`, `npm run build --prefix functions`, `npm run check`, puis `npm run build`. Le sous-projet Firebase possède son propre fichier de dépendances verrouillées ; ses dépendances doivent être installées avant la vérification TypeScript du dépôt. GitHub Actions exécute cette même séquence. Ces contrôles ne remplacent pas les essais du vrai terminal Stripe, du relais, du capteur de porte et des caméras.

## Mise à jour du 17 octobre 2026

Le navigateur appelle `/api/machine/...` sur le serveur Next local. Celui-ci ajoute le jeton `AGENT_TOKEN`, fourni uniquement à son environnement serveur par systemd. Aucun jeton dans les variables `NEXT_PUBLIC_*`. L’agent refuse les mutations anonymes ; un ancien kiosk ne pourra donc pas commander ce nouvel agent. Déployer les deux ensemble.

Un achat entièrement subventionné obtient désormais une autorisation locale persistée avant de distribuer ; les sélections et quantités sont contrôlées côté agent. Les nouvelles tentatives de spirale appartiennent au même achat et n’ajoutent aucune vente.

Les fonctions Firebase utilisent le runtime Node 22 et l’API modulaire firebase-admin. Leurs dépendances sont mises à niveau ; ce changement ne publie pas automatiquement les fonctions Firebase.

## Photos et services Google

Aucune analyse Gemini n’est conservée : les deux actions serveur, le formulaire de photo et Genkit sont supprimés, sans fournisseur de remplacement. Les polices sont celles du système, sans téléchargement Google Fonts. Le client Firebase, la connexion anonyme et le script d’envoi du catalogue à Firestore sont retirés. Le catalogue du kiosk reste local et synchronisé avec Fleet. Le lecteur actuel reste le WisePOS E.

Le dossier historique `functions/` et les configurations de déploiement Firebase restent dans le dépôt, sans appel depuis l’application Shaka. Ne pas les déployer pour cette installation. Leur présence ne prouve pas qu’un service est actuellement déployé ; aucun service ni aucune donnée distante n’a été supprimé pendant ce changement. L’historique d’éventuels envois antérieurs n’a pas été vérifié.

Ces suppressions prennent effet sur les machines seulement après déploiement de cette version.
