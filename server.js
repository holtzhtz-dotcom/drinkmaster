const bcrypt = require('bcryptjs');
const fs = require('fs');

async function main() {
  const usuarios = [{
    id: 1,
    nome: "Cliente Teste",
    email: "cliente@teste.com",
    senhaHash: await bcrypt.hash('123456', 10),
    ativo: true,
    maiorIdade: true,
    favoritos: []
  }];
  fs.writeFileSync('usuarios.json', JSON.stringify(usuarios, null, 2));
  console.log('✅ usuarios.json criado.');
}
main();
