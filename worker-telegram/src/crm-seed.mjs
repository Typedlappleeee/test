// Jeu de départ du CRM, repris tel quel du prototype « CRM Agence ».
// Ce sont des exemples : la première ouverture les charge pour que chaque écran
// montre quelque chose, puis tes propres données les remplacent au fil de l usage.

export const CRM_SEED = {
  "creators": [
    {
      "name": "Léa",
      "slotId": "creator-lea",
      "email": "lea@agence.com",
      "mkt": "Karim",
      "chat": "Yanis",
      "status": "Active"
    },
    {
      "name": "Mia",
      "slotId": "creator-mia",
      "email": "mia@agence.com",
      "mkt": "Karim",
      "chat": "Sarah",
      "status": "Active"
    },
    {
      "name": "Sofia",
      "slotId": "creator-sofia",
      "email": "sofia@agence.com",
      "mkt": "Inès",
      "chat": "Yanis",
      "status": "Active"
    },
    {
      "name": "Nina",
      "slotId": "creator-nina",
      "email": "nina@agence.com",
      "mkt": "Inès",
      "chat": "Sarah",
      "status": "Active"
    },
    {
      "name": "Chloé",
      "slotId": "creator-chloe",
      "email": "chloe@agence.com",
      "mkt": "Toi",
      "chat": "Yanis",
      "status": "Active"
    },
    {
      "name": "Jade",
      "slotId": "creator-jade",
      "email": "jade@agence.com",
      "mkt": "Toi",
      "chat": "—",
      "status": "Onboarding"
    }
  ],
  "accounts": [
    {
      "id": "ac1",
      "handle": "@lea.official",
      "network": "Instagram",
      "creator": "Léa",
      "employee": "Karim",
      "status": "Actif",
      "last": "il y a 2 h",
      "email": "leaofficial1@agence-mail.com",
      "password": "Ag3nce!11xK",
      "phone": "+33 6 12 34 56 11",
      "twofa": "App Authy · codes de secours en coffre",
      "notes": "",
      "link": "",
      "logs": [
        {
          "when": "Aujourd'hui 14:12",
          "who": "Karim",
          "what": "Reel publié — « rooftop »"
        },
        {
          "when": "Aujourd'hui 09:40",
          "who": "Karim",
          "what": "Connexion depuis Paris"
        },
        {
          "when": "Hier 21:05",
          "who": "Léa",
          "what": "Bio mise à jour"
        }
      ]
    },
    {
      "id": "ac2",
      "handle": "lea.of",
      "network": "OnlyFans",
      "creator": "Léa",
      "employee": "Yanis",
      "status": "Actif",
      "last": "il y a 20 min",
      "email": "leaof2@agence-mail.com",
      "password": "Ag3nce!22xK",
      "phone": "+33 6 12 34 56 12",
      "twofa": "App Authy · codes de secours en coffre",
      "notes": "",
      "link": "",
      "logs": [
        {
          "when": "Aujourd'hui 15:48",
          "who": "Yanis",
          "what": "PPV envoyé à 42 fans"
        },
        {
          "when": "Aujourd'hui 08:15",
          "who": "Yanis",
          "what": "Connexion"
        }
      ]
    },
    {
      "id": "ac3",
      "handle": "@lea.clips",
      "network": "TikTok",
      "creator": "Léa",
      "employee": "Tom",
      "status": "Shadowban",
      "last": "il y a 1 j",
      "email": "leaclips3@agence-mail.com",
      "password": "Ag3nce!33xK",
      "phone": "+33 6 12 34 56 13",
      "twofa": "App Authy · codes de secours en coffre",
      "notes": "",
      "link": "",
      "logs": [
        {
          "when": "Hier 18:22",
          "who": "Karim",
          "what": "Vidéo retirée par la plateforme"
        }
      ]
    },
    {
      "id": "ac4",
      "handle": "@miaaa",
      "network": "Instagram",
      "creator": "Mia",
      "employee": "Karim",
      "status": "Actif",
      "last": "il y a 4 h",
      "email": "miaaa4@agence-mail.com",
      "password": "Ag3nce!44xK",
      "phone": "+33 6 12 34 56 14",
      "twofa": "App Authy · codes de secours en coffre",
      "notes": "",
      "link": "",
      "logs": [
        {
          "when": "Aujourd'hui 11:30",
          "who": "Karim",
          "what": "3 stories publiées"
        }
      ]
    },
    {
      "id": "ac5",
      "handle": "mia.of",
      "network": "OnlyFans",
      "creator": "Mia",
      "employee": "Sarah",
      "status": "Actif",
      "last": "il y a 1 h",
      "email": "miaof5@agence-mail.com",
      "password": "Ag3nce!55xK",
      "phone": "+33 6 12 34 56 15",
      "twofa": "App Authy · codes de secours en coffre",
      "notes": "",
      "link": "",
      "logs": [
        {
          "when": "Aujourd'hui 14:55",
          "who": "Sarah",
          "what": "Relance sur 18 conversations"
        }
      ]
    },
    {
      "id": "ac6",
      "handle": "u/miaaa",
      "network": "Reddit",
      "creator": "Mia",
      "employee": "Tom",
      "status": "Actif",
      "last": "il y a 6 h",
      "email": "miaaa6@agence-mail.com",
      "password": "Ag3nce!66xK",
      "phone": "+33 6 12 34 56 16",
      "twofa": "App Authy · codes de secours en coffre",
      "notes": "",
      "link": "",
      "logs": [
        {
          "when": "Aujourd'hui 09:02",
          "who": "Karim",
          "what": "Post sur 4 subreddits"
        }
      ]
    },
    {
      "id": "ac7",
      "handle": "@sofia.rvs",
      "network": "Instagram",
      "creator": "Sofia",
      "employee": "Inès",
      "status": "Actif",
      "last": "il y a 3 h",
      "email": "sofiarvs7@agence-mail.com",
      "password": "Ag3nce!77xK",
      "phone": "+33 6 12 34 56 17",
      "twofa": "App Authy · codes de secours en coffre",
      "notes": "",
      "link": "",
      "logs": [
        {
          "when": "Aujourd'hui 12:10",
          "who": "Inès",
          "what": "Reel publié"
        }
      ]
    },
    {
      "id": "ac8",
      "handle": "sofia.of",
      "network": "OnlyFans",
      "creator": "Sofia",
      "employee": "Yanis",
      "status": "Suspendu",
      "last": "il y a 3 j",
      "email": "sofiaof8@agence-mail.com",
      "password": "Ag3nce!88xK",
      "phone": "+33 6 12 34 56 18",
      "twofa": "App Authy · codes de secours en coffre",
      "notes": "",
      "link": "",
      "logs": [
        {
          "when": "Lun. 10:04",
          "who": "Yanis",
          "what": "Compte suspendu — vérification en cours"
        }
      ]
    },
    {
      "id": "ac9",
      "handle": "@ninaxo",
      "network": "X",
      "creator": "Nina",
      "employee": "Priya",
      "status": "Actif",
      "last": "il y a 8 h",
      "email": "ninaxo9@agence-mail.com",
      "password": "Ag3nce!99xK",
      "phone": "+33 6 12 34 56 19",
      "twofa": "App Authy · codes de secours en coffre",
      "notes": "",
      "link": "",
      "logs": [
        {
          "when": "Aujourd'hui 07:20",
          "who": "Inès",
          "what": "2 posts programmés"
        }
      ]
    },
    {
      "id": "ac10",
      "handle": "@chloe.b",
      "network": "TikTok",
      "creator": "Chloé",
      "employee": "Tom",
      "status": "Actif",
      "last": "il y a 5 h",
      "email": "chloeb10@agence-mail.com",
      "password": "Ag3nce!1010xK",
      "phone": "+33 6 12 34 56 20",
      "twofa": "App Authy · codes de secours en coffre",
      "notes": "",
      "link": "",
      "logs": [
        {
          "when": "Aujourd'hui 10:45",
          "who": "Toi",
          "what": "Compte créé"
        }
      ]
    }
  ],
  "employees": [
    {
      "id": "e1",
      "name": "Karim",
      "email": "karim@agence.com",
      "role": "Manager Marketing",
      "status": "Actif",
      "since": "mars 2025"
    },
    {
      "id": "e2",
      "name": "Inès",
      "email": "ines@agence.com",
      "role": "Manager Marketing",
      "status": "Actif",
      "since": "mai 2025"
    },
    {
      "id": "e3",
      "name": "Yanis",
      "email": "yanis@agence.com",
      "role": "Manager Chatting",
      "status": "Actif",
      "since": "janv. 2025"
    },
    {
      "id": "e4",
      "name": "Sarah",
      "email": "sarah@agence.com",
      "role": "Manager Chatting",
      "status": "Actif",
      "since": "juin 2025"
    },
    {
      "id": "e5",
      "name": "Dylan",
      "email": "dylan@agence.com",
      "role": "Chatter",
      "status": "Actif",
      "since": "juil. 2025"
    },
    {
      "id": "e6",
      "name": "Maya",
      "email": "maya@agence.com",
      "role": "Chatter",
      "status": "Nuit",
      "since": "août 2025"
    },
    {
      "id": "e7",
      "name": "Tom",
      "email": "tom@agence.com",
      "role": "VA",
      "status": "Actif",
      "since": "avr. 2025"
    },
    {
      "id": "e8",
      "name": "Léa",
      "email": "lea@agence.com",
      "role": "Modèle",
      "status": "Actif",
      "since": "févr. 2025"
    },
    {
      "id": "e9",
      "name": "Priya",
      "email": "priya@agence.com",
      "role": "VA",
      "status": "Actif",
      "since": "sept. 2025"
    },
    {
      "id": "e10",
      "name": "Rayan",
      "email": "rayan@agence.com",
      "role": "VA",
      "status": "Actif",
      "since": "août 2025"
    }
  ],
  "seqs": [
    {
      "id": "s37",
      "title": "Semaine 37",
      "model": "Léa",
      "sent": false,
      "rows": [
        {
          "ref": "instagram.com/reel/DbKk2QnsPla",
          "note": "Tu te fais reconnaître dans la rue",
          "types": [
            "Extérieur",
            "Solo"
          ],
          "st": 0,
          "files": []
        },
        {
          "ref": "instagram.com/reels/DWZYWCACPMP",
          "note": "Faire comme sur la vidéo, dire ce qu'ils disent",
          "types": [
            "Extérieur"
          ],
          "st": 0,
          "files": []
        },
        {
          "ref": "",
          "note": "",
          "types": [],
          "st": 0,
          "files": []
        }
      ]
    },
    {
      "id": "s36",
      "title": "Semaine 36",
      "model": "Léa",
      "sent": true,
      "rows": [
        {
          "ref": "instagram.com/reel/DbX8TQguO9M",
          "note": "Faire comme sur la vidéo",
          "types": [],
          "st": 3,
          "files": [
            {
              "id": "v",
              "name": "IMG_7042.MP4"
            }
          ]
        },
        {
          "ref": "instagram.com/reel/DcEBOOPBUx5",
          "note": "Prendre exemple sur la vidéo, faire attention à l'angle : prendre le même angle qu'au début",
          "types": [],
          "st": 3,
          "files": [
            {
              "id": "v",
              "name": "IMG_7042.MP4"
            }
          ]
        },
        {
          "ref": "instagram.com/reels/DbAjXtKC62T",
          "note": "Prendre exemple sur la vidéo, avec un grand objet comme sur la vidéo",
          "types": [],
          "st": 2,
          "files": [
            {
              "id": "v",
              "name": "IMG_7048.MP4"
            }
          ]
        },
        {
          "ref": "instagram.com/reel/Da8SpausCpC",
          "note": "Prendre exemple sur la vidéo, attention à l'angle",
          "types": [
            "Extérieur"
          ],
          "st": 1,
          "files": [
            {
              "id": "v",
              "name": "IMG_7051.MP4"
            },
            {
              "id": "v2",
              "name": "IMG_7052.MP4"
            }
          ]
        },
        {
          "ref": "instagram.com/reel/Db3eVDhsd_j",
          "note": "Faire comme sur la vidéo, avoir une réaction à la fin",
          "types": [
            "Extérieur"
          ],
          "st": 1,
          "files": [
            {
              "id": "v",
              "name": "IMG_7051.MP4"
            },
            {
              "id": "v2",
              "name": "IMG_7052.MP4"
            }
          ]
        },
        {
          "ref": "instagram.com/reel/DbGhYhlI7WC",
          "note": "Faire comme sur la vidéo, dire ce qu'ils disent dans la vidéo",
          "types": [
            "Extérieur",
            "Solo"
          ],
          "st": 0,
          "files": []
        }
      ]
    },
    {
      "id": "m36",
      "title": "Semaine 36",
      "model": "Mia",
      "sent": true,
      "rows": [
        {
          "ref": "instagram.com/reel/DcQ1prLsAAe",
          "note": "Faire comme sur la vidéo",
          "types": [],
          "st": 3,
          "files": [
            {
              "id": "v",
              "name": "IMG_7042.MP4"
            }
          ]
        },
        {
          "ref": "instagram.com/reel/DbY7vTmsKk2",
          "note": "Prendre exemple sur la vidéo",
          "types": [
            "Extérieur"
          ],
          "st": 3,
          "files": [
            {
              "id": "v",
              "name": "IMG_7042.MP4"
            }
          ]
        }
      ]
    }
  ],
  "bank": [
    {
      "id": "bf1",
      "parent": null,
      "kind": "folder",
      "name": "Léa"
    },
    {
      "id": "bf2",
      "parent": null,
      "kind": "folder",
      "name": "Mia"
    },
    {
      "id": "bf3",
      "parent": null,
      "kind": "folder",
      "name": "Sofia"
    },
    {
      "id": "bf4",
      "parent": "bf1",
      "kind": "folder",
      "name": "Semaine 36"
    },
    {
      "id": "b1",
      "parent": "bf4",
      "kind": "media",
      "name": "IMG_7042.MP4",
      "mediaKind": "video",
      "tag": "Reel · prêt"
    },
    {
      "id": "b2",
      "parent": "bf4",
      "kind": "media",
      "name": "IMG_7051.MP4",
      "mediaKind": "video",
      "tag": "Story"
    },
    {
      "id": "b6",
      "parent": "bf1",
      "kind": "media",
      "name": "rooftop-04.JPG",
      "mediaKind": "photo",
      "tag": "Feed"
    },
    {
      "id": "b3",
      "parent": "bf2",
      "kind": "media",
      "name": "IMG_6890.MP4",
      "mediaKind": "video",
      "tag": "Reel · prêt"
    },
    {
      "id": "b4",
      "parent": "bf2",
      "kind": "media",
      "name": "set-lit-01.JPG",
      "mediaKind": "photo",
      "tag": "Feed"
    },
    {
      "id": "b5",
      "parent": "bf3",
      "kind": "media",
      "name": "teasing-ppv.MP4",
      "mediaKind": "video",
      "tag": "PPV"
    }
  ],
  "sops": [
    {
      "id": "s1",
      "title": "Poster un reel sur Instagram",
      "cat": "Posting",
      "duration": "6 min",
      "url": "",
      "who": "VA",
      "updated": "il y a 3 j",
      "access": []
    },
    {
      "id": "s2",
      "title": "Programmer une semaine de posts",
      "cat": "Posting",
      "duration": "11 min",
      "url": "",
      "who": "VA",
      "updated": "il y a 1 sem.",
      "access": []
    },
    {
      "id": "s3",
      "title": "Monter un reel sur CapCut (template agence)",
      "cat": "Montage",
      "duration": "14 min",
      "url": "",
      "who": "VA · Modèle",
      "updated": "il y a 2 sem.",
      "access": []
    },
    {
      "id": "s4",
      "title": "Ouvrir un compte et sécuriser l'A2F",
      "cat": "Comptes",
      "duration": "8 min",
      "url": "",
      "who": "VA",
      "updated": "hier"
    },
    {
      "id": "s5",
      "title": "Envoyer ses vidéos depuis le CRM",
      "cat": "Modèles",
      "duration": "4 min",
      "url": "",
      "who": "Modèle",
      "updated": "il y a 4 j",
      "access": []
    },
    {
      "id": "s6",
      "title": "Rédiger son shift report",
      "cat": "Process",
      "duration": "3 min",
      "url": "",
      "who": "VA",
      "updated": "il y a 5 j",
      "access": []
    }
  ],
  "inspos": [
    {
      "id": "i1",
      "handle": "@softmorning.co",
      "niche": "Lifestyle cosy",
      "followers": "412 k",
      "tags": [
        "Solo"
      ],
      "note": "Plans fixes très simples, lumière naturelle. Bon repère pour les réveils."
    },
    {
      "id": "i2",
      "handle": "@duo.streetstyle",
      "niche": "Street / duo",
      "followers": "289 k",
      "tags": [
        "Duo",
        "Extérieur"
      ],
      "note": "Interactions filmées à deux, réaction à la fin de chaque vidéo."
    },
    {
      "id": "i3",
      "handle": "@outdoor.golden",
      "niche": "Extérieur golden hour",
      "followers": "736 k",
      "tags": [
        "Extérieur"
      ],
      "note": "Toujours le même angle bas, contre-jour à 19 h."
    },
    {
      "id": "i4",
      "handle": "@gym.motive",
      "niche": "Sport",
      "followers": "1,2 M",
      "tags": [
        "Solo"
      ],
      "note": "Transitions rapides, texte à l'écran dès la première seconde."
    },
    {
      "id": "i5",
      "handle": "@rooftop.nights",
      "niche": "Urbain nuit",
      "followers": "154 k",
      "tags": [
        "Extérieur",
        "Solo"
      ],
      "note": "Néons + mouvement lent. Idéal pour les séquences en ville."
    },
    {
      "id": "i6",
      "handle": "@bff.energy",
      "niche": "Duo humour",
      "followers": "523 k",
      "tags": [
        "Duo"
      ],
      "note": "Dialogue face caméra, format 15 s, punch à la fin."
    }
  ],
  "groups": [
    {
      "id": "g1",
      "name": "VA — Posting",
      "members": [
        "Tom",
        "Priya"
      ],
      "messages": [
        {
          "who": "Toi",
          "text": "Les reels de Léa sont dans la banque, semaine 36. Postez 3 par jour, 11h / 17h / 21h.",
          "when": "09:12",
          "me": true
        },
        {
          "who": "Tom",
          "text": "Reçu. Je commence par TikTok.",
          "when": "09:20"
        },
        {
          "who": "Priya",
          "text": "Je prends Reddit, 4 subs comme la semaine dernière ?",
          "when": "09:26"
        },
        {
          "who": "Toi",
          "text": "Oui, mêmes subs. Pense aux titres différents sur chaque.",
          "when": "09:31",
          "me": true
        }
      ]
    },
    {
      "id": "g2",
      "name": "VA — Reddit",
      "members": [
        "Priya"
      ],
      "messages": [
        {
          "who": "Priya",
          "text": "Un compte a été shadowban, je change de créneau.",
          "when": "hier 18:04"
        }
      ]
    },
    {
      "id": "g3",
      "name": "Équipe marketing",
      "members": [
        "Karim",
        "Inès",
        "Tom"
      ],
      "messages": [
        {
          "who": "Karim",
          "text": "Brief shoot de mercredi validé.",
          "when": "hier 14:40"
        }
      ]
    }
  ],
  "opLinks": [
    {
      "id": "l1",
      "type": "drive",
      "name": "Drive agence — master",
      "url": "https://drive.google.com/drive/folders/master",
      "access": []
    },
    {
      "id": "l2",
      "type": "drive",
      "name": "Drive posting — reels",
      "url": "https://drive.google.com/drive/folders/reels",
      "access": []
    },
    {
      "id": "l3",
      "type": "doc",
      "name": "Process marketing",
      "url": "https://docs.google.com/document/d/process",
      "access": []
    },
    {
      "id": "l4",
      "type": "doc",
      "name": "Scripts & hooks",
      "url": "https://docs.google.com/document/d/hooks",
      "access": []
    },
    {
      "id": "l5",
      "type": "tool",
      "name": "Planificateur de posts",
      "url": "https://app.planoly.com",
      "access": []
    },
    {
      "id": "l6",
      "type": "tool",
      "name": "Raccourcisseur de liens",
      "url": "https://bitly.com",
      "access": []
    },
    {
      "id": "l7",
      "type": "other",
      "name": "Salon Telegram — OF Models EU",
      "url": "https://t.me/ofmodelseu",
      "access": []
    },
    {
      "id": "l8",
      "type": "other",
      "name": "Feuille de suivi paiements",
      "url": "https://docs.google.com/spreadsheets/d/pay",
      "access": []
    }
  ],
  "shiftReports": [
    {
      "name": "Tom",
      "at": "19:42",
      "text": "9 posts publiés (TikTok + IG). 2 comptes en attente de vérif. Reels Léa terminés."
    },
    {
      "name": "Priya",
      "at": "20:10",
      "text": "Reddit : 12 posts. 3 retirés par les mods, relancés sur d'autres subs."
    }
  ],
  "invites": [
    {
      "code": "HALO-4KQ7",
      "role": "Chatter",
      "created": "hier",
      "uses": 0
    },
    {
      "code": "HALO-9XB2",
      "role": "VA",
      "created": "il y a 3 j",
      "uses": 0
    }
  ],
  "roles": [
    "Chatter",
    "Modèle",
    "Manager Chatting",
    "Manager Marketing",
    "VA"
  ],
  "accessRoles": [
    {
      "id": "ar1",
      "name": "KENZA",
      "color": "oklch(0.78 0.14 350)",
      "members": [
        "e1",
        "e7"
      ]
    },
    {
      "id": "ar2",
      "name": "LÉA",
      "color": "oklch(0.80 0.13 62)",
      "members": [
        "e9"
      ]
    },
    {
      "id": "ar3",
      "name": "Posting EU",
      "color": "oklch(0.80 0.13 150)",
      "members": [
        "e7",
        "e9",
        "e10"
      ]
    }
  ],
  "networks": [
    "Instagram",
    "OnlyFans",
    "TikTok",
    "Reddit",
    "X",
    "Telegram"
  ],
  "team": [
    {
      "name": "Karim",
      "role": "marketing"
    },
    {
      "name": "Inès",
      "role": "marketing"
    },
    {
      "name": "Sarah",
      "role": "chatting"
    },
    {
      "name": "Yanis",
      "role": "chatting"
    },
    {
      "name": "Toi",
      "role": "admin"
    }
  ],
  "libItems": [
    {
      "id": "a1",
      "parent": null,
      "kind": "folder",
      "name": "Léa",
      "access": []
    },
    {
      "id": "a2",
      "parent": null,
      "kind": "folder",
      "name": "Mia",
      "access": []
    },
    {
      "id": "a3",
      "parent": null,
      "kind": "folder",
      "name": "Références & trends",
      "access": []
    },
    {
      "id": "a4",
      "parent": null,
      "kind": "doc",
      "name": "Process marketing",
      "html": "<h2>Cadence</h2><p>12 posts par semaine et par créatrice.</p><h2>Séquences</h2><p>Chaque séquence part le lundi. Les vidéos reçues sont validées sous 24 h.</p><ul><li>Brief envoyé le vendredi</li><li>Vidéos attendues sous 5 jours</li></ul>"
    },
    {
      "id": "a5",
      "parent": null,
      "kind": "sheet",
      "name": "Suivi postings",
      "active": 0,
      "pages": [
        {
          "id": "p1",
          "name": "Semaine 36",
          "nRows": 10,
          "nCols": 6,
          "cells": {
            "0-0": "Créatrice",
            "0-1": "Postés",
            "0-2": "Objectif",
            "1-0": "Léa",
            "1-1": "9",
            "1-2": "12",
            "2-0": "Mia",
            "2-1": "11",
            "2-2": "12"
          },
          "merges": [],
          "colW": {},
          "rowH": {}
        },
        {
          "id": "p2",
          "name": "Semaine 37",
          "nRows": 10,
          "nCols": 6,
          "cells": {
            "0-0": "Créatrice",
            "0-1": "Postés"
          },
          "merges": [],
          "colW": {},
          "rowH": {}
        }
      ]
    },
    {
      "id": "a6",
      "parent": "a1",
      "kind": "doc",
      "name": "Brief shoot rooftop",
      "html": "<p>Tenues : 3. Lumière : golden hour.</p>"
    },
    {
      "id": "a7",
      "parent": "a1",
      "kind": "sheet",
      "name": "Planning Léa",
      "active": 0,
      "pages": [
        {
          "id": "p3",
          "name": "Feuille 1",
          "nRows": 8,
          "nCols": 4,
          "cells": {
            "0-0": "Jour",
            "0-1": "Contenu"
          },
          "merges": [],
          "colW": {},
          "rowH": {}
        }
      ]
    }
  ]
}
