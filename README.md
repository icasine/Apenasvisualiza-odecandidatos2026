# Mapa Eleitoral de Contagem / MG

Aplicativo para ver, no mapa e em tabelas, os votos por seção e por escola em Contagem/MG, e comparar eleições de anos diferentes. Tem também a aba Minas, com os votos de deputados por município em Minas Gerais.

Os dados ficam no repositório privado do projeto, na pasta `public/data`. O site publicado não leva os dados embutidos: ele lê do GitHub ou, quando o login está ligado, do serviço de acesso.

## 1. Quem entra e o que vê

O login por usuário e senha é controlado pela planilha "Mapa Eleitoral - Usuários" (Google Planilhas). Cada linha é uma pessoa.

- Perfil Edição: vê tudo, abre a Gestão de dados e pode baixar CSV e PDF.
- Perfil Consulta: vê só os itens cujos números estão na coluna Candidatos (separados por vírgula). TODOS libera tudo. Não tem os botões de baixar CSV e PDF (tabela, boletim da escola e aba Minas).
- Ativo NÃO bloqueia a pessoa na hora. Trocar a senha também derruba o acesso antigo.

O número é o que libera: legenda e total do partido usam o número do partido (15, 40); votos brancos usam 95 e nulos 96. Para alguém ver o total do MDB, coloque 15 na lista dele.

O endereço do serviço de acesso fica em `src/config.ts` (`URL_ACESSO`). Vazio = app aberto, sem login.

Atenção: enquanto o repositório for público, uma pessoa com conhecimento técnico consegue ler os arquivos direto no GitHub. Para fechar de verdade, o repositório precisa ser privado e o script precisa de um token de leitura na propriedade `GITHUB_TOKEN`.

### Velocidade com o login ligado

Com o login, os dados passam pelo script da planilha, que leva alguns segundos para responder. Para a espera acontecer uma vez só:

- Na primeira entrada, o app recebe um pacote único com tudo o que a primeira tela precisa e mostra a porcentagem recebida.
- O que chegou fica guardado enquanto o app está aberto: trocar de aba não busca de novo.
- Uma cópia fica guardada no aparelho. Na vez seguinte o app abre na hora com ela e confere, em segundo plano, se há dados mais novos. Se houver, aparece o aviso "Há dados mais novos publicados", com o botão "Atualizar agora".
- Clicar em Sair apaga a cópia do aparelho.

O pacote único depende da versão 2 do script (`acesso-mapa-eleitoral-apps-script.gs`). Para atualizar sem mudar o endereço: na planilha, Extensões, Apps Script; troque todo o código; Implantar, Gerenciar implantações, lápis de editar, Versão "Nova versão", Implantar. Com o script antigo o app funciona, só que pedindo um arquivo por vez.

Quem tem perfil Edição e token do GitHub lê direto do GitHub, sempre a versão mais nova, sem cópia no aparelho.

## 2. Token do GitHub (só para quem edita)

Para gravar dados é preciso um token pessoal. Use sempre o tipo fine-grained, que vale só para este repositório.

1. No GitHub: foto do perfil, Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token.
2. Repository access: Only select repositories, e escolha este repositório.
3. Permissions, Repository permissions, Contents: Read and write.
4. Copie o token (começa com `github_pat_`) e anote a data de validade.
5. No app, aba Gestão de dados: usuário, repositório, token e, se quiser, a validade. Com a validade preenchida o app avisa sete dias antes de vencer.

O token clássico (começa com `ghp_`) vale para todos os seus repositórios; o app só aceita se você marcar que quer usar mesmo assim. A opção "Não lembrar neste aparelho" guarda o token só até fechar a aba.

## 3. Como enviar dados

Tudo é feito na aba Gestão de dados. Cada gravação mostra o andamento arquivo por arquivo; se algo falhar, "Tentar de novo" continua do ponto em que parou.

### Votos (aba 1)

Envie uma planilha Excel ou CSV com uma linha por seção, as colunas de zona e seção e uma ou mais colunas de votos. Cada coluna marcada vira um item: candidato, legenda do partido, total do partido ou outros. Ano e cargo podem ser aplicados a todas de uma vez.

A prévia mostra, para cada item: seções novas, iguais às já salvas (ignoradas), já salvas com valor diferente (você escolhe substituir, manter o antigo ou não salvar), repetidas dentro do arquivo, células vazias (sem dado, não viram zero) e valores ilegíveis. Um clique em "Salvar tudo" grava todos os itens e atualiza o índice uma vez no fim.

### Locais de votação do TSE (aba 2)

Envie a planilha de locais do TSE do ano (colunas `NR_ZONA`, `NR_SECAO`, `NR_LOCAL_VOTACAO`, `NM_LOCAL_VOTACAO`, `DS_ENDERECO`, `NM_BAIRRO`, `NR_LATITUDE`, `NR_LONGITUDE`, `AA_ELEICAO`, `QT_ELEITOR_SECAO`, `DS_TIPO_SECAO_AGREGADA`, `NR_SECAO_PRINCIPAL`). O app grava os locais, o eleitorado e as seções agregadas daquele ano. Confira o ano antes de salvar.

Um ano sem cadastro próprio de locais é mostrado nas escolas do cadastro mais recente, onde cada seção vota hoje. É o modo normal: a comparação segue o eleitor, não o prédio da época. Uma nota na tela diz isso e aponta as seções que votavam em outro local naquele ano (o app sabe pelo número do local que vem na planilha de votos). Os votos de uma seção que hoje é agregada são somados à seção principal. Quem quiser ver o prédio da época envia os locais daquele ano: aí a eleição passa a usar os locais, o eleitorado e as agregadas do ano dela.

### Para incluir uma eleição de outro ano

1. Envie os votos (aba 1), com o ano certo. Só isso já basta.
2. Mesma pessoa: itens com o mesmo nome em eleições diferentes são ligados sozinhos, mesmo que o número e o cargo mudem. O título da coluna pode ser só o nome ("Carol do Teteco") ou trazer número e partido entre parênteses ("Carol do Teteco (15678 MDB)"): o parêntese não entra no nome. Se a pessoa mudou de nome de urna, abra Dados salvos, Editar dados, e escolha no campo Pessoa o nome que ela já tem em outra eleição.
3. Opcional: envie os locais daquele ano (aba 2) para ver o prédio da época. Nesse caso, confira a aba Escolas entre anos. O app liga as escolas sozinho (mesmo número e nome parecido; mesmo nome; até 150 metros) e você corrige o que ficou errado.

Na lista de candidatos, a busca acha por nome, número, partido, cargo ou ano (várias palavras juntas, como "mdb 2024"). Com a busca ativa, "Marcar os N" marca só os encontrados. "Só os marcados" mostra o que está no mapa. Quando uma eleição tem mais de oito itens, a lista vem separada por partido: cada partido abre e fecha, mostra o total de votos e tem uma caixa que marca ou desmarca todos dele de uma vez.

## 4. Conferir e consertar

- Dados salvos: lista os itens e os lotes de cada um. Lote "Substituído" não tem mais nenhuma seção e pode sair da lista sem apagar votos. Antes de excluir, o app mostra quantas seções e votos saem de verdade.
- Verificar e reparar: compara os arquivos da pasta com o índice. Mostra arquivos sem entrada no índice, entradas sem arquivo e totais diferentes. "Reconstruir índice a partir dos arquivos" mostra o antes e o depois e só grava quando você confirma. A pasta `public/data/mg` (aba Minas) fica de fora.
- Tabela, aba Conferência: seções com votos que não estão no cadastro de locais, escolas sem correspondência entre anos, seções agregadas e seções sem coordenadas.

## 5. Como recuperar um arquivo apagado

Toda gravação e toda exclusão vira um registro no histórico do GitHub. Em Dados salvos, o botão "Histórico no GitHub" abre o histórico do arquivo; de lá dá para ver e restaurar a versão anterior. Depois de restaurar, rode Verificar e reparar.

## 6. Aba Minas

Mostra os 853 municípios com os votos por município, de deputado federal, estadual ou outro cargo. O envio é feito dentro da própria aba, no botão "Enviar votos por município". Os dados ficam em `public/data/mg`, com índice próprio.

Planilha recomendada (CSV com ponto e vírgula ou Excel), uma linha por município:

```
uf;municipio_cod_tse;municipio_cod_ibge;municipio;votos_depfed_1510_NEWTON_CARDOSO_JR;pct_validos_depfed_1510;votos_depest_40027_DANIEL_DO_IRINEU;pct_validos_depest_40027;secoes_totalizadas_pct;observacao
```

- Cada coluna `votos_CARGO_NUMERO_NOME` vira um item; cargo (`depfed`, `depest`, `vereador`), número e nome saem do título e podem ser corrigidos na tela.
- Com a coluna do código IBGE, os municípios são ligados pelo código, sem depender da grafia do nome. Sem ela, vale o nome.
- A coluna `pct_validos_CARGO_NUMERO` é opcional. Quando existe, o mapa ganha o modo Percentual (onde o candidato é forte, mesmo em cidade pequena).
- Linhas de total no fim ("TOTAL ...") não entram como município: servem para o app conferir a soma e avisar se não bater.
- Na coluna `observacao`, um texto como `1510 NOME (MDB) Eleito por média | 40027 NOME (PSB) Suplente` preenche o partido e a situação.
- `secoes_totalizadas_pct` abaixo de 100 gera aviso de apuração parcial.

Também aceita o arquivo do TSE com uma linha por candidato, município e zona: nesse caso informe os números dos candidatos.

Cor de cada item: na janela "Enviar votos por município", em Itens salvos, escolha a cor e clique em "Salvar cor". Com um item só marcado, o mapa usa tons dessa cor; com vários somados, usa o azul padrão; em "Quem lidera", cada município leva a cor de quem ganhou ali. Em Contagem, a cor de cada item é trocada em Dados salvos, botão Editar dados.

## 7. Onde fica cada arquivo

```
public/data
  indice.json                      lista de anos e itens salvos
  locais.json                      cópia dos locais do ano mais recente
  correspondencia_locais.json      escolas ligadas à mão entre eleições
  ANO/locais.json                  escolas e seções do TSE daquele ano
  ANO/eleitorado.json              eleitores aptos por seção
  ANO/agregadas.json               seções agregadas
  ANO/CARGO/NUMERO-nome.json       votos e lotes de cada item
  mg/                              dados da aba Minas
```

## 8. Números de conferência de 2026

1.421 seções, 111 locais, 4 zonas, 463.243 eleitores e 62 seções agregadas. Zona 90: 115.541 eleitores; zona 91: 104.702; zona 93: 115.660; zona 313: 127.340.
