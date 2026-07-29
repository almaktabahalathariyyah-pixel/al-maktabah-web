const fs = require('fs');
let content = fs.readFileSync('src/app/admin/page.js', 'utf8');
let id = 1;
content = content.replace(/<Select\s+styles=\{selectStyles\}/g, () => '<Select instanceId={String(' + (id++) + ')} styles={selectStyles}');
fs.writeFileSync('src/app/admin/page.js', content, 'utf8');
