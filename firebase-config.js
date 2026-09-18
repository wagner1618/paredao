// ============================================================
//  CONFIGURAÇÃO DO FIREBASE  —  PREENCHA ESTE ARQUIVO
// ------------------------------------------------------------
//  Passo a passo detalhado está no arquivo README.md.
//  Resumo: crie um projeto grátis em https://console.firebase.google.com
//  ative Authentication (E-mail/senha) e Firestore Database, e cole
//  aqui os dados que o Firebase te mostra ("Config do app da Web").
// ============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyDoMao9TcYHfJ5uKH10Zr__bm1SXYMOtgc",
  authDomain: "paredao-85c2a.firebaseapp.com",
  projectId: "paredao-85c2a",
  storageBucket: "paredao-85c2a.firebasestorage.app",
  messagingSenderId: "895358169156",
  appId: "1:895358169156:web:b55f4e47649e02ee768c11"
};

// ------------------------------------------------------------
//  Quem é o CICOM e quem é a Guarnição.
//  Crie estes 2 usuários no Authentication do Firebase e coloque
//  os MESMOS e-mails abaixo. O e-mail que estiver na lista do CICOM
//  entra como CICOM; qualquer outro entra como Guarnição.
// ------------------------------------------------------------
export const EMAILS_CICOM = [
  "cicom@paredao.app"
];
