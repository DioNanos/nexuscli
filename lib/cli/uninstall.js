/**
 * NexusCLI - Uninstall Command
 * Prepares for clean uninstallation with optional data removal
 */

const chalk = require('chalk');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR = path.join(process.env.HOME, '.nexuscli');
const BOOT_SCRIPT = path.join(process.env.HOME, '.termux/boot/nexuscli-boot.sh');

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getDirSize(dirPath) {
  let totalSize = 0;
  try {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        totalSize += getDirSize(filePath);
      } else {
        totalSize += fs.statSync(filePath).size;
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return totalSize;
}

async function uninstallCommand(options) {
  console.log('');
  console.log(chalk.red('╔══════════════════════════════════════════════╗'));
  console.log(chalk.red('║') + chalk.white.bold('   🗑️  NexusCLI Uninstall                     ') + chalk.red('║'));
  console.log(chalk.red('╚══════════════════════════════════════════════╝'));
  console.log('');

  // Check if data directory exists
  const dataExists = fs.existsSync(DATA_DIR);
  const bootExists = fs.existsSync(BOOT_SCRIPT);

  if (!dataExists && !bootExists) {
    console.log(chalk.yellow('Nessun dato NexusCLI trovato.'));
    console.log('');
    console.log('Per rimuovere il pacchetto npm, esegui:');
    console.log(chalk.cyan('  npm uninstall -g @mmmbuto/nexuscli'));
    console.log('');
    return;
  }

  // Show what will be affected
  console.log(chalk.white.bold('Dati trovati:'));
  console.log('');

  if (dataExists) {
    const dataSize = getDirSize(DATA_DIR);
    console.log(chalk.cyan(`  📁 ${DATA_DIR}`));
    console.log(chalk.gray(`     Dimensione: ${formatSize(dataSize)}`));

    // List contents
    const contents = fs.readdirSync(DATA_DIR);
    for (const item of contents) {
      const itemPath = path.join(DATA_DIR, item);
      const stat = fs.statSync(itemPath);
      const icon = stat.isDirectory() ? '📂' : '📄';
      const size = stat.isDirectory() ? formatSize(getDirSize(itemPath)) : formatSize(stat.size);
      console.log(chalk.gray(`     ${icon} ${item} (${size})`));
    }
    console.log('');
  }

  if (bootExists) {
    console.log(chalk.cyan(`  🚀 ${BOOT_SCRIPT}`));
    console.log(chalk.gray('     Script avvio automatico Termux'));
    console.log('');
  }

  // Stop server if running
  console.log(chalk.yellow('Arresto server in corso...'));
  try {
    execSync('pkill -f "node.*nexuscli" 2>/dev/null || true', { stdio: 'ignore' });
    console.log(chalk.green('✓ Server arrestato'));
  } catch (e) {
    console.log(chalk.gray('  Server non in esecuzione'));
  }
  console.log('');

  // Ask what to do
  console.log(chalk.white.bold('Cosa vuoi fare?'));
  console.log('');
  console.log(chalk.cyan('  1)') + ' Rimuovi TUTTO (dati + configurazione + boot script)');
  console.log(chalk.cyan('  2)') + ' Mantieni i dati (solo rimuovi boot script)');
  console.log(chalk.cyan('  3)') + ' Annulla');
  console.log('');

  const choice = await prompt(chalk.yellow('Scelta [1/2/3]: '));

  if (choice === '3' || choice === 'n' || choice === 'no' || choice === '') {
    console.log('');
    console.log(chalk.green('Operazione annullata.'));
    return;
  }

  if (choice === '1') {
    // Remove everything
    console.log('');
    const confirm = await prompt(chalk.red.bold('⚠️  ATTENZIONE: Tutti i dati saranno eliminati! Confermi? [s/N]: '));

    if (confirm !== 's' && confirm !== 'si' && confirm !== 'y' && confirm !== 'yes') {
      console.log('');
      console.log(chalk.green('Operazione annullata.'));
      return;
    }

    console.log('');
    console.log(chalk.yellow('Rimozione in corso...'));

    // Remove boot script
    if (bootExists) {
      try {
        fs.unlinkSync(BOOT_SCRIPT);
        console.log(chalk.green(`✓ Rimosso ${BOOT_SCRIPT}`));
      } catch (e) {
        console.log(chalk.red(`✗ Errore rimozione boot script: ${e.message}`));
      }
    }

    // Remove data directory
    if (dataExists) {
      try {
        fs.rmSync(DATA_DIR, { recursive: true, force: true });
        console.log(chalk.green(`✓ Rimosso ${DATA_DIR}`));
      } catch (e) {
        console.log(chalk.red(`✗ Errore rimozione dati: ${e.message}`));
      }
    }

    console.log('');
    console.log(chalk.green.bold('✓ Pulizia completata!'));

  } else if (choice === '2') {
    // Keep data, only remove boot script
    console.log('');

    if (bootExists) {
      try {
        fs.unlinkSync(BOOT_SCRIPT);
        console.log(chalk.green(`✓ Rimosso ${BOOT_SCRIPT}`));
      } catch (e) {
        console.log(chalk.red(`✗ Errore rimozione boot script: ${e.message}`));
      }
    }

    console.log('');
    console.log(chalk.green.bold('✓ Boot script rimosso'));
    console.log(chalk.cyan(`  I tuoi dati sono stati mantenuti in: ${DATA_DIR}`));
    console.log(chalk.gray('  Reinstallando NexusCLI, ritroverai le tue configurazioni.'));

  } else {
    console.log('');
    console.log(chalk.red('Scelta non valida. Operazione annullata.'));
    return;
  }

  console.log('');
  console.log(chalk.white.bold('Per completare la disinstallazione, esegui:'));
  console.log('');
  console.log(chalk.cyan('  npm uninstall -g @mmmbuto/nexuscli'));
  console.log('');
}

module.exports = uninstallCommand;
