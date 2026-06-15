async function testDDG() {
  try {
    const statusRes = await fetch('https://duckduckgo.com/duckchat/v1/status', {
      headers: {
        'x-vqd-accept': '1',
        'Accept': 'text/event-stream',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://duckduckgo.com/',
        'Origin': 'https://duckduckgo.com/'
      }
    });

    console.log('Status Code:', statusRes.status);
    console.log('Headers returned:');
    for (const [k, v] of statusRes.headers.entries()) {
      console.log(`  ${k}: ${v}`);
    }
    const text = await statusRes.text();
    console.log('Body:', text);
  } catch (err) {
    console.error('Error:', err);
  }
}

testDDG();
