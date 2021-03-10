'use strict';
const { sanitizeEntity } = require('strapi-utils')
const stripe = require('stripe')(process.env.STRIPE_PK)
const puppeteer = require('puppeteer')
const fs = require('fs-extra')
const hbs = require('handlebars')
const path = require('path')

const fromDecimalToInt = (number) => parseInt( number*100)

const compile = async (templateName, pedido) => {
	const filePath = path.join(process.cwd(), 'templates', `${templateName}.hbs`)
	const html = await fs.readFile(filePath, 'utf-8')
	return hbs.compile(html)(pedido)
}


const creadorPdf = async  ({ pedido, mombreArchivo  }) => {
	try{
		const browser = await puppeteer.launch({
			executablePath: '/usr/bin/chromium-browser',
			headless: true,
  			args: ['--no-sandbox'],
			ignoreDefaultArgs: ['--disable-extensions']
		  })
		const page = await browser.newPage()

		const content = await compile('tm-pdf', pedido)
		
		await page.emulateMedia('screen')
		await page.pdf({
			path: `${nombreArchivo}.pdf`,
			format: 'A4',
			printBackground: true
		})

		console.log('Pdf creado')
		await browser.close()
		process.exit()
	}catch (e) {
		console.log('Error pdf',e)
	}

}


/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/concepts/controllers.html#core-controllers)
 * to customize this controller
 */

module.exports = {
    async find(ctx){
      const { user } = ctx.state
      let entities
      if(ctx.query._q)  {
           entities = await strapi.services.pedidos.search({...ctx.query, user: user.id})
      } else {
	   entities = await strapi.services.pedidos.find({...ctx.query, user: user.id})
      }

      return entities.map(entity => sanitizeEntity(entity, {model: strapi.models.pedidos}))
    },

     async findOne(ctx) {
      const { id } = ctx.params
      const { user } = ctx.state

	const entity = await strapi.services.pedidos.findOne( {id, user: user.id })
   	return sanitizeEntity(entity, {model: strapi.models.pedidos })
     },

    async create(ctx){

	const BASE_URL = ctx.request.headers.origin || 'https://goo-labs.com/'
	
        const { producto } = ctx.request.body

	const { clinica } = ctx.request.body

	const { nombreCliente } = ctx.request.body

	const { dniCliente } = ctx.request.body


        if(!producto){
                return ctx.throw(400, 'Especifique un producto')
        }

        const realProducto = await strapi.services.productos.findOne({ id: producto.id })
        if(!realProducto) {
                return ctx.throw(404, 'No se encuentra el id del producto')
        }

        const { user } = ctx.state

	console.log(BASE_URL)

        const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                customer_email: user.email,
                mode: 'payment',
                success_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
	        cancel_url: `${BASE_URL}`,
                line_items: [
                        {
                                price_data:{
                                        currency: 'eur',
                                        product_data: {
                                                name: realProducto.Nombre
                                        },
                                        unit_amount: fromDecimalToInt(realProducto.Precio)
                                },
                                quantity: 1
                        }
                ],
        })

	console.log(session.id)
	

	console.log(clinica)

        const newPedido = await strapi.services.pedidos.create({
                user: user.id,
                Producto: realProducto.id,
                Total: realProducto.Precio,
                Estado: 'SinPagar',
                chekout_session: session.id,
		NombreClinica: clinica.Nombre,
		DireccionClinica: clinica.Direccion,
		CorreoClinica: clinica.Correo,
		TelefonoClinica: clinica.Telefono,
		HorarioClinica: clinica.Horario,
		CorreoEnviado: false,
		NombreCliente: nombreCliente,
		DniCliente: dniCliente,
        })

        return { id: session.id }
     },

     async confirm(ctx) {
	const { chekout_session } = ctx.request.body
	console.log(chekout_session)     
	const session = await stripe.checkout.sessions.retrieve(chekout_session)
	
	if (session.payment_status === 'paid'){
		const updatePedido = await strapi.services.pedidos.update({
			chekout_session
		},
		{
			Estado: 'Pagado'
		})

		const NPedido = await strapi.services.pedidos.findOne({ chekout_session: chekout_session })

		console.log(NPedido)

		return sanitizeEntity(NPedido, {model: strapi.models.pedidos})

	} else{
		ctx.throw(400, 'Pago no correcto, contacte para obtener ayuda')
	}
     },

    async mail(ctx){
       const { mail_to } = ctx.request.body
       const { pedido_id } = ctx.request.body
       const { pedido } = ctx.request.body
       console.log(pedido.CorreoEnviado)
       const nombreArchivo = pedido_id.substring(0,10)	    

       if ( pedido.CorreoEnviado === false  ) {
	    const bonus = await creadorPdf(pedido, nombreArchivo)
	    const mailer = await strapi.plugins['email'].services.email.send({
	         to: mail_to,
	      	 from: "contacto@goo-labs.com",
	         replyTo: "contacto@goo-labs.com",
	         subject: "Identificador de prueba",
	         text: `Querido cliente: \nGracias por hacer su comprar en Goo-Labs.\n \nEl identificador de prueba es: ${nombreArchivo},\npara la clínica ${pedido.NombreClinica} - ${pedido.DireccionClinica}.
		    \nAntes de ir a la clínica, recuerde ${pedido.HorarioClinica}. Puede poner en contacto con la clínica llamado al ${pedido.TelefonoClinica}.
		    \n \n Imprima o tenga a mano este correo antes de acudir a su clínica, ya que sus datos serán comprobados.Recuerde que no tiene que abonar NADA más para adquirir su prueba.
		    \n \n \n Para cualquier información extra o algún tipo de problema, puede contactarnos al correo contacto@goo-labs.com.
		    \n Un saludo, el equipo de Goo-Labs.`
	       })	       
	    ctx.send('Email enviado')

	    const chekout_session = pedido.chekout_session

	    const updatePedidoDos = await strapi.services.pedidos.update({
		   chekout_session
	    },
	    {
		   CorreoEnviado: true
	    })   
	}

    }
};
