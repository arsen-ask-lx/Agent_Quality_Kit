# Rules

Make sure the tree is clean, then build and check before every commit:

```sh
npm run build
npm run debug        # build + install + logs
make test
make -j4 lint
just fmt
```

Scripts named like `npm run gen:*` are generated; run `make <target>` for anything else.
