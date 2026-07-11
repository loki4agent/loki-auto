git msg="up":
    find . -name .DS_Store -exec rm -rvf {} \;
    -git add .gitignore
    -git add .
    -git commit -m "{{msg}}"
    -git push

pkg:
    bun run build
    rm -rf *.xpi
    cd dist/firefox && zip -r ../../loki-auto.xpi * && cd -
    cd dist/chrome && zip -r ../../loki-auto-chrome.zip * && cd -
