
module.exports = ({ env }) => ({
	 email: {
	       provider: 'sendgrid',
	       providerOptions: {
	                 apiKey: env('SENDGRID_API_KEY'),
		},
	        settings: {
	       		defaultFrom: 'contacto@goo-labs.com',
	                defaultReplyTo: 'contacto@goo-labs.com',
	        },
        },	                                      
});
