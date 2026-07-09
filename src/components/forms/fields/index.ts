/**
 * Ecosistema unificado de field-wrappers para formularios (RHF + Zod).
 *
 * Todos los wrappers combinan internamente `FormField + FormItem + FormLabel +
 * FormControl + FormMessage` sobre una primitiva shadcn, y aceptan el mismo
 * shape base: `{ control, name, label, description?, required?, disabled? }`.
 *
 * Uso mínimo:
 *
 * ```tsx
 * const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
 * return (
 *   <Form {...form}>
 *     <form onSubmit={form.handleSubmit(onSubmit)}>
 *       <TextField control={form.control} name="name" label="Nombre" required />
 *       <NumberField control={form.control} name="qty" label="Cantidad" min={1} />
 *       <CurrencyField control={form.control} name="price" label="Precio" required />
 *       <DateField control={form.control} name="start" label="Inicio" required />
 *       <SelectField control={form.control} name="status" label="Estado" options={[...]} />
 *     </form>
 *   </Form>
 * );
 * ```
 */
export { TextField } from "./TextField";
export { TextareaField } from "./TextareaField";
export { SelectField, type SelectOption } from "./SelectField";
export { CheckboxField } from "./CheckboxField";
export { SwitchField } from "./SwitchField";
export { NumberField } from "./NumberField";
export { CurrencyField } from "./CurrencyField";
export { DateField } from "./DateField";
export { DateRangeField } from "./DateRangeField";
export { CustomerField } from "./CustomerField";
export { SupplierField } from "./SupplierField";
export { ForkliftField } from "./ForkliftField";
