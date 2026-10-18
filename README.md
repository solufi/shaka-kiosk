# Shaka — kiosque machine

Interface locale Next.js reliée à l’agent Raspberry Pi Shaka et au Fleet Manager. Les appels matériels et paiements passent par le proxy local authentifié ; les clés restent côté serveur.

## Retraits employés

Le mode interne vient de Fleet : code personnel, articles fournis par l’entreprise ou payants, confirmation du montant, photo externe documentée par l’agent et distribution après autorisation. Une caméra indisponible ne bloque pas le retrait. Un terminal indisponible bloque les articles payants.

Stripe Connect encaisse sur le compte de l’entreprise. Les frais Stripe réels et 1 % pour Shaka sont déduits des recettes, sans supplément au prix affiché. Le calcul et le rapprochement sont effectués côté agent/Fleet, jamais dans le navigateur.

Installer ce kiosque avec l’agent compatible, puis activer le mode dans Fleet. Le champ `employeeWithdrawalProtocol: 1` du package est rapporté avec la version du kiosque par le heartbeat. Ne pas installer ce kiosque seul sur un ancien agent sans l’API `/employee/config`.

Les photos ne sont pas accessibles au kiosque. En cas d’interruption, l’écran reprend l’identité du retrait sans relancer les moteurs ou créer un nouveau paiement. Voir le guide opérationnel [Fleet — Retraits employés et Connect](https://github.com/solufi/shakafleet/blob/main/docs/employee-withdrawals.md).

Vérifications : `npm ci`, `npm ci --prefix functions`, `npm run check`, `npm run build`. Les anciennes fonctions dans `functions/` sont seulement compilées par la CI ; ce parcours local ne les appelle pas et aucune photo ou donnée employé n’est envoyée à Google.
