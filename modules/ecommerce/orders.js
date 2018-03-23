exports.setup = function(mstream, program, db){
    const stripe = require('stripe')(program.stripepriv);
  
    // place order
    mstream.post('/orders/place', function(req, res){
      // Fill this log and save it when order succeeds/fail
      var orderLog = {};
      var errorArray = [];

      // TODO: Lookup items and see if it requires an address
      var requiresAddress = false;

      if(!req.body.email){
        errorArray.push('No email');
      }
      if(!req.body.stripe_token){
        errorArray.push('No credit card');
      }

      if(requiresAddress){
        if(!req.body.address_line_1 || !req.body.shipping_name || !req.body.city || !req.body.zip || !req.body.country){
          errorArray.push('Missing Address');
        }
      }

      if(!req.body.address_line_2){
        req.body.address_line_2 = '';
      }
      if(!req.body.state){
        req.body.state = '';
      }
      if(!req.body.order_notes){
        req.body.order_notes = '';
      }
  
      // Verify items
      if(!req.body.order_items){
        errorArray.push('No Items');
      }
  
      // If there are errors, return them and exit
      if(errorArray.length > 0){
        // TODO: ?? Log bad requests.  The frontend form should really not allow this to happen
        res.status(488).json( {error: 'Order not submitted', errorList: errorArray} );
        return;
      }
  
      // We can't let the user enter some stupid bullshit and break the system
      db.all("SELECT items_json FROM events WHERE event_id = ?;", [req.body.event_id], function(err, rows){
        if(err || !rows){
          res.status(491).json({error:'Bad user.  Stop price tampering'});
          return;
        }
        
        var tempCheckObj = {};
        var failFlag = false;
        var decodedItems = JSON.parse(rows[0].items_json)
  
        for(let s of decodedItems){
          tempCheckObj[s.item_id] = s.price;
        }
  
        for(let s of req.body.order_items){
          if(s.price !== tempCheckObj[s.item_id]){
            failFlag = true;
          }
        }
  
        if(failFlag){
          res.status(491).json({error:'Bad user.  Stop price tampering'});
          return;
        }
  
        // Calculate total and add it to array
        var orderTotal = calculateOrderTotal(req.body.order_items);
  
        var orderJson = JSON.stringify(req.body.order_items)
        // Verify all metadata values are less than 500 chars
        if(orderJson.length>499){
          orderJson = orderJson.substring(0, 499);
        }

        
  
        stripe.charges.create({
          amount: orderTotal,
          currency: "usd",
          source: req.body.stripe_token,
          description: "Boston Photography", // TODO: Customize this
          statement_descriptor:  "Boston Photography", // TODO: Customize this
          metadata: {
            shippingName: req.body.shipping_name,
            addressLine1: req.body.address_line_1,
            addressLine2: req.body.address_line_2,
            state: req.body.state,
            city: req.body.city,
            zip: req.body.zip,
            orderItems: orderJson,
            eventId: req.body.event_id,
            email: req.body.email,
          },
          receipt_email: req.body.email,
        }, function(err, charge) {
          if(err){
            var errMsg = '';
            if(err.message){
              errMsg = err.message;
              // TODO: Log error
            }else{
              errMsg = 'Card error. Please try again';
            }
            res.status(497).json({success: false, message: errMsg});
            return;
          }
  
          // TODO: Write log
          res.json({success: true});
  
          // Update DB
          db.run("INSERT INTO orders (amount, shipping_name, shipping_address_line_1, shipping_address_line_2, shipping_state, shipping_city, shipping_zip, items_json_dump, email, notes, order_status, order_stripe_id, order_log_json, events_id) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?);",
            [orderTotal,
              req.body.shipping_name,
              req.body.address_line_1,
              req.body.address_line_2,
              req.body.state,
              req.body.city,
              req.body.zip,
              JSON.stringify(req.body.order_items),
              req.body.email,
              req.body.order_notes,
              'placed',
              charge.id,
              JSON.stringify(orderLog),
              req.body.event_id
            ], function(err, row){
              if(err){
                console.log(err);
              }
  
          });
        });
      });
    });
  
  
    function calculateOrderTotal(orderItems ){
      // TODO: Force all these values to int
      var orderTotal = 0;
      var orderTax = 0;
      for(var s of orderItems){
        orderTotal = orderTotal + (s.price * s.quantity);
      }
  
      return orderTotal;
    }
  }
  