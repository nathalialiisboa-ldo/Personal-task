# Minhas Tarefas — Painel Diário

Aplicativo web interativo (HTML/CSS/JS puro, sem backend) para gerenciar tarefas diárias de forma visual e fluida.

## Funcionalidades

- **CRUD completo de tarefas**: criar, editar, ver detalhes e excluir.
- **Painel Kanban** (A fazer / Em andamento / Concluída) com drag-and-drop, ou visualização em lista.
- **Detalhes ricos por tarefa**: descrição, prioridade, categoria, prazo, checklist de subtarefas e notas/comentários de progresso.
- **Evidências e anexos**: arraste arquivos, cole imagens da área de transferência ou selecione fotos/documentos. Imagens têm preview em miniatura e visualização ampliada (lightbox).
- **Busca, filtros e ordenação** por status, prioridade, categoria e texto livre.
- **Métricas de uso**: total de tarefas, taxa de conclusão, tempo médio de conclusão, sequência de dias ativos (streak), gráficos de atividade diária, distribuição por status/prioridade/categoria e um log de atividades recentes.
- **Tema claro/escuro**, com detecção automática da preferência do sistema.
- **Exportar/Importar dados** em JSON (inclui anexos) para backup ou migração.
- **100% local**: os dados ficam no navegador (localStorage para tarefas/atividades, IndexedDB para os arquivos anexados). Nenhum dado é enviado a servidores.

## Como usar

Basta abrir `index.html` no navegador — não é necessário instalar nada.

## Publicar no GitHub Pages

1. Faça push deste repositório para o GitHub.
2. Vá em **Settings → Pages**.
3. Em "Source", selecione a branch principal e a pasta `/ (root)`.
4. Salve. Em alguns minutos o app estará disponível em `https://<seu-usuario>.github.io/<repositorio>/`.

## Estrutura

```
index.html        Estrutura da aplicação (painel, dashboard, modais)
css/style.css      Estilos, temas e layout responsivo
js/db.js           Camada IndexedDB para anexos (fotos/arquivos/evidências)
js/app.js          Lógica da aplicação: CRUD, filtros, métricas e gráficos
```

## Observações

- Arquivos individuais anexados são limitados a 8MB para preservar performance do navegador.
- Como os dados residem no navegador, use "Exportar dados" periodicamente para backup, ou para levar suas tarefas para outro dispositivo/navegador (via "Importar dados").
