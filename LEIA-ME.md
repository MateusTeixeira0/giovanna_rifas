# Giovanna Matos — Rifas (HTML + CSS + JavaScript)

Sem TypeScript, sem Next.js, sem Tailwind. As telas são arquivos HTML e CSS normais na pasta `public/`.
Um servidor pequeno em JavaScript (`server.js` + pasta `src/`) cuida do banco, login, Pix, roleta e sorteio.

## Como rodar (Windows)
1. Instale o Node.js (nodejs.org, versão LTS) — se ainda não tiver.
2. Abra esta pasta no VSCode e abra o terminal (Ctrl + ').
3. Copie `.env.example` para `.env` e preencha `DATABASE_URL` (conexão do Neon) e `JWT_SECRET`.
   - Você pode **reaproveitar o `.env` do projeto antigo**: só troque `NEXT_PUBLIC_SITE_URL` por `SITE_URL`.
4. Rode: `npm install`
5. Rode: `npm start`
6. Abra http://localhost:3000

**As tabelas do banco são criadas sozinhas.** Não existe mais `prisma db push` nem `seed`.
(As tabelas do projeto antigo ficam no Neon sem uso; os dados antigos não são aproveitados.)

## Administrador
Entre em http://localhost:3000/conta com `admin@giovannamatos.com` / `admin123` (ou o que você pôs no `.env`).
Você vai direto para o painel. **Troque a senha antes de publicar** (hoje isso é feito mudando `ADMIN_EMAIL`/`ADMIN_PASSWORD` no `.env` e apagando a linha do admin na tabela `admin_users` no painel do Neon, ou me peça uma tela de troca de senha).

## Onde fica cada coisa
- `public/index.html`, `rifa.html`, `checkout.html`, `conta.html`, `roleta.html`, `ganhadores.html`, `termos.html` — telas do site
- `public/admin/*.html` — telas do painel admin
- `public/css/style.css` — todo o visual (cores no topo: `--orange` é o dourado, `--bg` o fundo)
- `public/js/app.js` e `admin.js` — funções compartilhadas
- `server.js` e `src/` — servidor (regras, banco, Pix)

## Como o Pix funciona (3 modos, automático)
1. **Mercado Pago** (token no `.env`): cobrança e confirmação 100% automáticas via webhook.
2. **Manual** (chave Pix cadastrada em Admin → Pagamentos): QR Pix real, mas **você confirma** cada pagamento na lista “Pedidos aguardando pagamento”.
3. **Teste** (nada configurado): botão “Simular pagamento”. Nenhum dinheiro real.

⚠️ Antes de usar Mercado Pago (ou outro gateway) leia os termos dele sobre rifas/sorteios: alguns bloqueiam esse tipo de atividade. E rifas no Brasil têm restrições legais — consulte um advogado.

## O que mudou em relação ao projeto antigo
- Compra exige conta (cadastro com telefone confirmado). Login por e-mail **ou telefone**.
- Giro da roleta é decidido no servidor usando a conta logada.
- Nomes de ganhadores aparecem abreviados em público (“Maria S.”) por privacidade.
- Removido o slide de “vídeo” falso do protótipo.
