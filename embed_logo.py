import os

b64_file = 'logo_b64.txt'
html_file = 'index.html'

with open(b64_file, 'r', encoding='utf-8') as f:
    b64_data = f.read().strip()

with open(html_file, 'r', encoding='utf-8') as f:
    html_content = f.read()

new_html = html_content.replace('src="./logo.jpg"', f'src="data:image/jpeg;base64,{b64_data}"')

with open(html_file, 'w', encoding='utf-8') as f:
    f.write(new_html)

print('Logo embedded successfully.')
