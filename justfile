git msg="up":
    find . -name .DS_Store -exec rm -rvf {} \;
    -git add .gitignore
    -git add .
    -git commit -m "{{msg}}"
    -git push
