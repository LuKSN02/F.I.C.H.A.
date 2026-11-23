# F.I.C.H.A.

Plataforma web (fichas, campanhas, mesa virtual e homebrew) para Ordem Paranormal. Projeto de fãs, não oficial.

## Estrutura

```
/
├── index.html          # página inicial / agentes / social
├── criar.html          # criação de ficha (agente ou NPC)
├── ficha.html          # ficha completa
├── ficha-view.html     # ficha em modo visualização
├── portrait.html       # retrato do personagem
├── campanhas.html      # campanhas
├── homebrew.html       # conteúdo homebrew
├── tabletop.html       # mesa virtual 2D
├── tabletop3d.html     # mesa virtual 3D
├── 1000.png            # ícone do app (referenciado como /1000.png)
├── css/                # folhas de estilo (ficha-design, criar-design, tabletop, tabletop3d)
├── js/                 # scripts das mesas (tabletop, tabletop3d)
└── assets/img/
    ├── rituais/        # símbolos e rituais dos elementos (sangue, morte, energia, conhecimento, medo)
    └── ui/             # selo não-oficial, logo animado e imagens de interface
```

As páginas HTML ficam na raiz de propósito: mantém os URLs públicos e os links entre páginas.
Arquivos de PWA (`manifest.json`, `sw.js`) também devem ficar na raiz.
