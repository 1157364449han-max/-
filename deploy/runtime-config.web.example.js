/* GitHub Actions 会根据仓库变量 DONGJIEXI_API_BASE 生成同类文件。这里不能放 API 密钥。 */
window.DONGJIEXI_CONFIG = Object.freeze({
  version: '0.34.0',
  deployment: 'web',
  apiBase: 'https://api.example.com',
  apiEnabled: true,
  requiresAuth: true,
  updateChannel: 'stable'
});
