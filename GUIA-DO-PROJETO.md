# 🥫 Despensa Online — Guia do Projeto

App de celular para a família controlar a despensa, receber o cardápio da semana feito pela IA e manter a lista de compras.

## O que tem nesta pasta

| Arquivo | Para que serve |
|---|---|
| `index.html` | O app inteiro (telas e lógica) |
| `1-banco-de-dados.sql` | Cria as tabelas no Supabase (rodar 1 vez) |
| `2-funcao-ia.ts` | O "robô" de IA que fica no Supabase e guarda a chave da Anthropic em segredo |
| `manifest.json`, `sw.js`, `icone*.png`, `icone.svg` | Permitem instalar o app na tela inicial do celular |

## O que o app faz

- **🥫 Despensa**: itens separados por despensa/geladeira/freezer e categoria, com validade e "quantidade mínima". Botões **−/+** para ajustar rápido.
- **📷 Ler nota de compra**: tire foto do cupom. Se tiver QR Code de NFC-e, o app busca os itens direto na Sefaz; se não tiver (ou for lista escrita à mão), a IA lê a foto. Também dá para colar uma lista do WhatsApp. Antes de guardar, você confere e corrige tudo; itens repetidos têm a quantidade somada.
- **🍽️ Cardápio da semana (IA)**: usa o que tem em casa (o que vence antes vem primeiro), os gostos e restrições de cada pessoa, os equipamentos da cozinha e o tempo máximo de preparo. Mostra tempo, calorias, porção de cada pessoa e o que falta comprar. O modo de preparo é gerado só quando você abre a receita (economiza IA).
- **✅ Cozinhei!**: desconta os ingredientes da despensa.
- **⭐ Favoritas**: a IA passa a sugerir mais pratos parecidos.
- **💡 Com o que tem**: 32 receitas embutidas, ordenadas pelo que você já tem. Funcionam sem IA, de graça.
- **🛒 Compras**: lista compartilhada com a família, botões para puxar "o que está acabando" e "o que falta para o cardápio", e envio pelo WhatsApp. Ao ler a nota da compra, o que chegou é riscado da lista sozinho.
- **👤 Perfis**: cada pessoa com peso, altura, atividade, objetivo e meta de calorias calculada (fórmula de Mifflin-St Jeor), IMC e água por dia. Crianças: meta manual.
- **🏡 Casa compartilhada**: cada pessoa da família cria seu login e entra na casa com o **código de convite**.

> **Versão grátis (atual):** a IA está **desligada** (`IA_LIGADA = false` no `index.html`). Funcionam de graça: despensa, colar/digitar lista, cardápio montado com as 32 receitas do app (com modo de preparo), compras, perfis e casa compartilhada. Ficam escondidos até ligar a IA: leitura da foto/QR Code da nota e cardápio "pensado" pela IA. Para ligar depois: Passos 3 e 4 abaixo e mudar para `IA_LIGADA = true`.

> **Modo demonstração:** enquanto o `index.html` estiver com `COLE_AQUI` na configuração, o app abre com dados de exemplo salvos só no aparelho. Dá para ver e testar tudo antes de configurar.

---

## Como colocar no ar (uma vez só)

### Passo 1 — GitHub (onde o app fica publicado)
✅ **Feito em 22/10/2026.** Repositório `AgathaVasco/despensa-online` (público), Pages em **main / (root)**.
App no ar: `https://agathavasco.github.io/despensa-online/`

> ⚠️ A pasta do app (o repositório) é **`Documents\GitHub\despensa-online\despensa-online`** (a subpasta). A pasta de fora não é usada. Para mudar o app: editar os arquivos da subpasta → GitHub Desktop → **Commit to main** → **Push origin**.

### Passo 2 — Supabase (banco de dados e logins)
1. Em https://supabase.com → **New project** → nome `despensa-online` → crie uma senha do banco (guarde) → região **South America (São Paulo)**.
2. Menu **SQL Editor → New query** → cole todo o `1-banco-de-dados.sql` → **Run**.
3. Menu **Authentication → URL Configuration** → em **Site URL** coloque o endereço do Passo 1.
4. (Opcional, mais simples para a família) **Authentication → Sign In / Providers → Email** → desligue **Confirm email**. Assim a conta funciona na hora, sem precisar clicar no e-mail.

### Passo 3 — Chave da IA (Anthropic) · OPCIONAL, só para ligar a IA
Dica para gastar quase nada: peça ao Claude para trocar o modelo do robô para o **Claude Haiku** (cerca de 40× mais barato que o Opus).
1. Em https://console.anthropic.com → crie a conta → **Billing** → adicione créditos (US$ 5 duram bastante; veja os custos abaixo).
2. **Limits** → defina um limite de gasto mensal (ex.: US$ 10) para não ter surpresa.
3. **API Keys → Create Key** → copie a chave (começa com `sk-ant-`). Ela só aparece uma vez.

### Passo 4 — O robô de IA no Supabase · OPCIONAL, só para ligar a IA
1. No Supabase: **Edge Functions → Deploy a new function → Via Editor**.
2. Nome da função: **`ia`** (exatamente assim). Apague o código de exemplo, cole todo o `2-funcao-ia.ts` → **Deploy**.
3. Abra a função `ia` → **Details** → desligue **Verify JWT / Enforce JWT verification** → salve. (A própria função confere se a pessoa está logada no app.)
4. **Edge Functions → Secrets → Add new secret**: nome `ANTHROPIC_API_KEY`, valor = a chave do Passo 3.
5. No `index.html`, troque `const IA_LIGADA = false;` por `const IA_LIGADA = true;` → Commit e Push.

### Passo 5 — Ligar o app ao Supabase
1. No Supabase: **Project Settings → API Keys** (ou **API**). Copie a **Project URL** e a **Publishable key** (`sb_publishable_...`).
2. Abra o `index.html` no Bloco de Notas, procure `COLE_AQUI` (perto do começo do código) e cole a URL e a chave no lugar.
3. No GitHub Desktop: escreva um resumo (ex.: "Liga o app ao Supabase") → **Commit to main** → **Push origin**.
4. Em 1–2 minutos, abra o link do app, crie sua conta e crie a casa.

### Passo 6 — Instalar no celular
- **Android (Chrome):** abra o link → menu **⋮** → **Instalar app** (ou "Adicionar à tela inicial").
- **iPhone (Safari):** abra o link → botão **Compartilhar** → **Adicionar à Tela de Início**.

Para a família: mande o link + o código de convite (tela **Perfis → Enviar convite**). Cada um cria a própria conta e digita o código.

---

## Quanto custa a IA (estimativa)

Modelo usado: Claude Opus 5.5. Valores aproximados por uso:

| Ação | Custo aproximado |
|---|---|
| Cardápio de 7 dias (almoço + jantar) | ~US$ 0,15 a 0,30 |
| Ler uma nota/foto ou lista | ~US$ 0,02 a 0,05 |
| Modo de preparo de uma receita | ~US$ 0,02 |

Usando toda semana (1 cardápio + 2 notas + 5 receitas) dá **cerca de US$ 1 a 2 por mês**. O que **não** usa IA (grátis): despensa, compras, perfis, "Com o que tem" e o botão "Gerar rápido com receitas do app".

## Se algo der errado

| Problema | O que fazer |
|---|---|
| "Chave da IA inválida" | Confira o segredo `ANTHROPIC_API_KEY` (Passo 4.4) e se há créditos na Anthropic |
| "Faça login novamente" ao usar a IA | Saia e entre de novo no app |
| Erro 401 ao gerar cardápio | Verifique se desligou o **Verify JWT** da função (Passo 4.3) |
| "A Sefaz não mostrou os itens" | Alguns estados exigem captcha no site da nota; o app tenta ler pela foto automaticamente |
| Cardápio demora e dá erro | Gere menos dias de uma vez (ex.: 3 dias) |
| Família não vê as mesmas coisas | Confirme que todos entraram com o **mesmo código** da casa |
| Celular mostra versão antiga | Feche o app e abra de novo (ele busca a versão nova sempre que tem internet) |

## Ideias para as próximas versões

1. **💰 Gastos com mercado**: guardar o preço de cada item da NFC-e e mostrar quanto a família gasta por mês, por categoria, e quando um produto ficou mais caro.
2. **📧 Aviso de validade por e-mail** (mesmo robô Brevo do app Agenda & Tarefas): "3 itens vencem amanhã".
3. **📦 Código de barras**: escanear o produto para cadastrar um item avulso.
4. **🥡 Marmitas e sobras**: planejar porções extras do jantar para o almoço do dia seguinte.
5. **📈 Acompanhamento de peso**: registrar o peso de cada pessoa ao longo do tempo e ajustar a meta.
