# Operação Paredão — Notas e melhorias futuras

Documento de apoio para retomar o projeto mais à frente. Resume **como está hoje**,
as **decisões tomadas** e uma **lista de melhorias** possíveis.

_Última atualização: 18/09/2026._

---

## 1. Como está hoje (resumo do funcionamento)

- **Site estático** hospedado no **GitHub Pages** (repo: `wagner1618/paredao`).
- **Dados** no **Firebase Firestore** (projeto `paredao-85c2a`); login por
  **e-mail/senha** (Firebase Authentication). Custo: **R$ 0,00**.
- **Dois perfis** (definidos em `firebase-config.js` → `EMAILS_CICOM`):
  - **CICOM** (computador): lança ocorrências colando o texto do WhatsApp.
  - **Guarnição** (celular): assume o serviço, reordena a rota e marca status.

### Fluxo
1. **Guarnição assume o serviço** (senha `paredao`) informando viatura, KM,
   horário de início/término, função + graduação + nome dos policiais e observações.
2. **CICOM lança ocorrências** — só é liberado **depois** que o serviço é aberto
   (antes disso vê "Aguardando abertura de serviço"). Cola o bloco do WhatsApp;
   o card mostra o texto completo e separa os campos nos bastidores só para o
   link "Abrir no mapa".
3. **Guarnição atende**: reordena por setas ▲▼ (celular) ou arrastando (PC) e
   marca cada ocorrência via janela de confirmação com observação
   (**Atendida** já sugere "som cessado").
4. **Guarnição encerra o serviço** (senha `paredao`) — as ocorrências vão para o
   **Histórico**. O término registrado é o **horário informado ao assumir**, não
   a hora real do clique.

### Histórico
- Lista de serviços encerrados + **resumo com totais** (serviços, enviadas,
  atendidas, não atendidas) e **detalhamento por status**.
- Filtro: **Geral**, **Por mês** ou **Por período** (data de/até).
- Botão **Limpar histórico** (só CICOM, senha `MOW21ola&`).

### Senhas (ficam no código — ver limitação em "Decisões")
| Ação | Senha |
|---|---|
| Assumir serviço | `paredao` |
| Encerrar serviço | `paredao` |
| Limpar histórico (CICOM) | `MOW21ola&` |

### Arquivos
| Arquivo | O que é |
|---|---|
| `index.html` | Estrutura das telas |
| `styles.css` | Aparência (escuro, mobile-first) |
| `app.js` | Lógica (login, parser, tempo real, rota, histórico, senhas) |
| `firebase-config.js` | Config do Firebase + lista de e-mails do CICOM |
| `firestore.rules` | Regras de segurança do banco |
| `README.md` | Guia de instalação |

### Cache busting — IMPORTANTE ao publicar
Os celulares guardam `styles.css` e `app.js` em cache e podem continuar mostrando
a **versão antiga** depois de uma publicação. Para evitar isso, o `index.html`
carrega esses arquivos com um número de versão:

```html
<link rel="stylesheet" href="styles.css?v=2" />
<script type="module" src="app.js?v=2"></script>
```

**Toda vez que alterar `styles.css` ou `app.js`, aumente o número nos dois lugares**
(`?v=3`, depois `?v=4`, ...). Isso obriga todos os navegadores a baixar a versão
nova, sem ninguém precisar limpar cache no celular.

- O `firebase-config.js` é importado dentro do `app.js` e **não** tem versão
  (quase nunca muda). Se um dia precisar forçar atualização dele, aplicar o mesmo
  esquema `?v=` no `import`.
- Se ainda assim aparecer a versão velha em um celular, forçar uma vez: aba
  anônima ou limpar o cache do site no Chrome.

---

## 2. Decisões já tomadas
- **Firebase** em vez de Supabase (não pausa por inatividade).
- **Um login por perfil** (CICOM / Guarnição), não por policial.
- **Colar o texto do WhatsApp** (parser flexível: com ou sem etiqueta de
  "Município/Bairro"); o card exibe o texto na íntegra.
- **Reordenar manualmente** (setas/arrastar), sem mapa automático (evita custo
  de API do Google Maps).
- **Senhas no código**: servem como trava contra ação acidental / de quem não
  deve mexer — **não** são segurança forte (quem abrir o código as vê). Para
  segurança real, seria preciso validar no back-end (Firebase).

---

## 3. Pendências de configuração (uma vez, feitas pelo Wagner)
- Firebase: Authentication (e-mail/senha) com os usuários `cicom@…` e
  `guarnicao@…`; Firestore criado e `firestore.rules` publicado.
- GitHub Pages ativado (Settings → Pages → branch `main` / root).

---

## 4. Ideias de melhoria (backlog)

### Endereço mais amigável (sem custo)
- Renomear o repo para `wagner1618.github.io` → URL sem o `/paredao`; **ou**
- Publicar no **Netlify/Vercel** → `paredao.netlify.app` (nome à escolha); **ou**
- Domínio próprio `paredao.com.br` (**único que custa**, ~R$40/ano).

### Usabilidade
- **Editar observações do serviço** durante o plantão (hoje só ao assumir).
- Confirmação na ação **"Reabrir"** ocorrência.
- Deixar mais **evidente para a guarnição** que não há serviço aberto.
- Senha (ou confirmação) no botão **Apagar** ocorrência do CICOM.
- Botão **👁️ mostrar/ocultar** já existe nas senhas.

### Relatórios / histórico
- Detalhamento por **bairro/cidade** e por **policial**.
- **Exportar** o serviço/histórico (PDF ou planilha CSV).
- Tempo médio de atendimento (se registrar hora de criação vs. finalização).

### Rota
- **Ordenar por distância** automaticamente (geolocalização + Google Maps) —
  atenção ao possível custo de API.

### Segurança / robustez
- Trocar senhas "no código" por validação real no back-end.
- Regras do Firestore mais restritivas por perfil (hoje: qualquer autenticado
  lê/escreve).
- Confirmar com a corporação o uso institucional e conformidade com a **LGPD**
  (dados de ocorrências e de policiais).

---

## 5. Como pedir uma melhoria depois
Abrir o projeto no Claude Code e descrever o que quer. Este arquivo serve de
contexto rápido do que já existe e do que ficou planejado.
