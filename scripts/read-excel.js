import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';

const filePath = 'C:\\Users\\sadio keita\\Downloads\\JOURNAL STAR ENERGY HANN 14 09 2026.xlsx';
const outputPath = 'C:\\Users\\sadio keita\\Downloads\\Gestion-OGGS-main (1)\\Gestion-OGGS-main\\data-extraction.json';

try {
  const workbook = XLSX.readFile(filePath);
  console.log('Feuilles disponibles:', workbook.SheetNames);

  const extraction = {
    metadata: {
      fichier: 'JOURNAL STAR ENERGY HANN 14 09 2026.xlsx',
      date_extraction: new Date().toISOString(),
      feuilles: workbook.SheetNames,
    },
    feuilles: {}
  };

  workbook.SheetNames.forEach(sheetName => {
    console.log(`\nTraitement de la feuille: ${sheetName}`);

    const worksheet = workbook.Sheets[sheetName];
    
    // Essayer d'extraire en format structuré (avec en-têtes automatiques)
    try {
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      if (jsonData.length > 0) {
        extraction.feuilles[sheetName] = {
          format: 'structuré',
          nombre_lignes: jsonData.length,
          colonnes: Object.keys(jsonData[0]),
          donnees: jsonData
        };
        console.log(`  - ${jsonData.length} lignes extraites (format structuré)`);
        console.log(`  - Colonnes: ${Object.keys(jsonData[0]).join(', ')}`);
      } else {
        // Si structuré échoue, essayer format tableau
        const tableData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const rows = tableData.filter(row => 
          row && row.length > 0 && row.some(cell => cell !== null && cell !== undefined && cell !== '')
        );
        
        extraction.feuilles[sheetName] = {
          format: 'tableau',
          nombre_lignes: rows.length,
          nombre_colonnes: rows.length > 0 ? rows[0].length : 0,
          donnees: rows
        };
        console.log(`  - ${rows.length} lignes extraites (format tableau)`);
      }
    } catch (error) {
      console.log(`  - Erreur d'extraction: ${error.message}`);
      extraction.feuilles[sheetName] = {
        format: 'erreur',
        erreur: error.message,
        donnees: []
      };
    }
  });

  // Sauvegarder l'extraction en JSON
  writeFileSync(outputPath, JSON.stringify(extraction, null, 2), 'utf-8');
  console.log(`\n✅ Extraction sauvegardée dans: ${outputPath}`);

  // Résumé statistique
  console.log('\n========================================');
  console.log('RÉSUMÉ DE L\'EXTRACTION');
  console.log('========================================');
  Object.entries(extraction.feuilles).forEach(([nom, feuille]) => {
    console.log(`${nom}: ${feuille.nombre_lignes} lignes (${feuille.format})`);
  });

} catch (error) {
  console.error('Erreur lors de la lecture du fichier:', error.message);
  console.error(error.stack);
}
