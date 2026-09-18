# Operação Paredão 🛡️

Sistema simples para organizar as ocorrências de perturbação do sossego da
**Operação Paredão (PMBA)**. O CICOM lança as ocorrências (colando o texto do
WhatsApp) e a guarnição vê, reordena pela melhor rota e vai marcando o status.
Tudo atualiza em **tempo real** dos dois lados.

- **Site:** hospedado de graça no **GitHub Pages**.
- **Dados:** guardados de graça no **Firebase (Firestore)**.
- **Custo total: R$ 0,00.**

---

## Como funciona

- **CICOM** → cola o bloco do WhatsApp (Município/Bairro, Endereço, Referência,
  Descrição). O sistema separa os campos sozinho e cria os cards. Pode colar
  vários de uma vez.
- **Guarnição** → *assume o serviço* informando os 3-4 policiais e a viatura;
  reordena as pendentes (setas ▲▼ no celular ou arrastando no computador) e
  marca cada uma como **Atendida**, **Endereço não encontrado** ou
  **Não será possível**. Ao finalizar, o card sai das pendentes e vai para as
  finalizadas.
- **Encerrar serviço** → limpa o quadro e joga tudo para o **Histórico**.

---

## Instalação (uma vez só) — passo a passo

### 1) Criar o projeto no Firebase (grátis)
1. Acesse <https://console.firebase.google.com> e faça login com uma conta Google.
2. Clique em **Adicionar projeto** → dê um nome (ex.: `paredao`) → pode desativar
   o Google Analytics → **Criar projeto**.

### 2) Ativar o Login (Authentication)
1. No menu à esquerda: **Criação > Authentication** → **Vamos começar**.
2. Aba **Sign-in method** → clique em **E-mail/senha** → **Ativar** → **Salvar**.
3. Aba **Users** → **Adicionar usuário**. Crie **dois** logins:
   - CICOM: e-mail `cicom@paredao.app` e uma senha.
   - Guarnição: e-mail `guarnicao@paredao.app` e uma senha.
   > Podem ser quaisquer e-mails/senhas. Anote-os.

### 3) Ativar o Banco de Dados (Firestore)
1. Menu **Criação > Firestore Database** → **Criar banco de dados**.
2. Escolha a localização (ex.: `southamerica-east1`) → pode iniciar em
   **modo de teste** → **Ativar**.
3. Vá na aba **Regras**, apague o conteúdo, cole o conteúdo do arquivo
   **`firestore.rules`** deste projeto e clique em **Publicar**.

### 4) Pegar a configuração do app
1. No Firebase, clique na **engrenagem ⚙️ > Configurações do projeto**.
2. Em **Seus apps**, clique no ícone **`</>`** (Web) → dê um apelido → **Registrar app**.
3. O Firebase mostra um bloco `const firebaseConfig = { ... }`. Copie esses valores.
4. Abra o arquivo **`firebase-config.js`** deste projeto e cole os valores nos
   campos correspondentes. Em `EMAILS_CICOM`, deixe o e-mail que você usou para
   o CICOM (passo 2).

### 5) Publicar no GitHub Pages
1. Crie um repositório no GitHub e envie todos os arquivos desta pasta.
2. No repositório: **Settings > Pages**.
3. Em **Source**, escolha **Deploy from a branch** → branch **main** → pasta
   **/ (root)** → **Save**.
4. Aguarde ~1 minuto. O GitHub mostra o endereço do site (algo como
   `https://SEU-USUARIO.github.io/paredao/`). Pronto!

---

## Uso no dia a dia
- Abra o link no celular. Dá pra **"Adicionar à tela inicial"** para virar um
  ícone de app.
- CICOM entra com o login do CICOM; a guarnição com o login da guarnição.

## Segurança e privacidade (leia)
- Só quem tem os logins que você criou consegue entrar.
- Os dados (endereços, descrições, nomes dos policiais) ficam no servidor do
  Google/Firebase. Trate como ferramenta de apoio; siga as normas da corporação
  sobre dados de ocorrência (LGPD/uso institucional).
- A camada gratuita do Firebase é folgada para o volume de vocês
  (dezenas de ocorrências por serviço).

## Arquivos do projeto
| Arquivo | O que é |
|---|---|
| `index.html` | Estrutura das telas |
| `styles.css` | Aparência (visual escuro, mobile-first) |
| `app.js` | Toda a lógica (login, parser, tempo real, rota, histórico) |
| `firebase-config.js` | **Você preenche** com os dados do seu Firebase |
| `firestore.rules` | Regras de segurança para colar no Firebase |
