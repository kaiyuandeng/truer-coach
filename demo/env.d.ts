declare module "virtual:sql-wasm" {
  const base64: string;
  export default base64;
}
declare module "sql.js/dist/sql-wasm.js" {
  export { default } from "sql.js";
}
declare module "sql.js/dist/sql-asm.js" {
  export { default } from "sql.js";
}
