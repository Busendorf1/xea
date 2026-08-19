declare module "*.css";
declare module "*.scss";
declare module "*.sass";
declare module "*.less";

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
