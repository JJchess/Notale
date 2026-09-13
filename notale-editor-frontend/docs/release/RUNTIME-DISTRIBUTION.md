# Runtime dependency distribution

`npm run licenses:runtime` builds the six backend browser entry dependency graphs in memory using esbuild metafiles, without writing runtime output. It records exact installed package versions and the explicitly copied ECharts, Reveal CSS and PathKit WASM packages in runtime-dependencies.json. This identifies packages participating in these build graphs; tree-shaking can remove parts of a package, so graph membership is a conservative review scope, not a byte-level attribution map.

The current report includes 44 third-party package names. Five participating installed versions lack full collected license text: brotli 1.3.3, croact 1.0.4, croact-css-styled 1.1.9, dfa 1.2.0 and fontkit 2.0.4. These remain the priority for runtime redistribution review. Declaration metadata alone has not been labeled as a recovered original license file.

Other missing records must be assessed against the artifact actually published. A source archive that does not contain node_modules differs from a prebuilt Next server or native-library container. The report does not inspect frontend Next output, archive byte identity, native-library source obligations or Git history. It must be regenerated after dependency or build-entry changes; selected contract archives require their own consistency check before release.
