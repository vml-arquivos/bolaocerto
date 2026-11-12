import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Post do blog, como o painel envia. */
export class SaveBlogPostDto {
  @IsString() @Length(3, 140) titulo!: string;
  @IsOptional() @IsString() @MaxLength(90) @Matches(SLUG, { message: 'Endereço do post: use letras minúsculas, números e hífen (ex.: como-funciona-o-bolao).' }) slug?: string;
  @IsOptional() @IsString() @MaxLength(320) resumo?: string;
  @IsString() @Length(1, 60000) conteudo!: string;
  @IsOptional() @IsString() @MaxLength(300) imagem?: string;
  @IsOptional() @IsString() @MaxLength(160) imagemAlt?: string;
  @IsOptional() @IsString() @MaxLength(70) seoTitulo?: string;
  @IsOptional() @IsString() @MaxLength(170) seoDescricao?: string;
  @IsOptional() @IsString() @MaxLength(200) palavrasChave?: string;
  @IsOptional() @IsString() @MaxLength(60) categoria?: string;
  @IsIn(['rascunho', 'publicado']) status!: 'rascunho' | 'publicado';
}

/** SEO do site (página inicial e padrão das demais). */
export class SaveSiteSeoDto {
  @IsString() @Length(10, 70) titulo!: string;
  @IsString() @Length(50, 170) descricao!: string;
  @IsOptional() @IsString() @MaxLength(250) palavrasChave?: string;
  @IsOptional() @IsString() @MaxLength(300) imagem?: string;
}
